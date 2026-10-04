import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMER_LIMITS, normalizeAccountNumber } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { CustomerBankAccount } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import type { BankAccountDto } from './dto/customer-profile.dto.js';

const qrPrefix = (customerId: string) => filePrefix(storageFolder.customerPayments(customerId), 'refund-qr');

export function toBankAccount(a: CustomerBankAccount) {
  return {
    id: a.id,
    bankCode: a.bankCode,
    accountName: a.accountName,
    accountNumber: a.accountNumber,
    hasQr: a.qrImageKey !== null,
    isDefault: a.isDefault,
  };
}

/** Refund destinations (§2.10). QR images live in private storage. */
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(customerId: string) {
    const rows = await this.prisma.customerBankAccount.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toBankAccount);
  }

  /** Stores an uploaded QR image; the returned key is then attached via create/update. */
  async uploadQr(customerId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'INVALID_QR', message: 'No file uploaded' });
    if (file.size > CUSTOMER_LIMITS.qrMaxBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 2 MB or smaller' });
    }
    const kind = detectImage(file.buffer);
    if (!kind) {
      throw new BadRequestException({ code: 'INVALID_QR', message: 'Upload a PNG, JPG or WebP image' });
    }
    const key = `${qrPrefix(customerId)}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    return { qrImageKey: key };
  }

  async qr(customerId: string, id: string) {
    const account = await this.owned(customerId, id);
    if (!account.qrImageKey) throw new NotFoundException('No QR image');
    return this.storage.get(account.qrImageKey);
  }

  async create(customerId: string, dto: BankAccountDto) {
    const count = await this.prisma.customerBankAccount.count({ where: { customerId } });
    if (count >= CUSTOMER_LIMITS.maxBankAccounts) {
      throw new BadRequestException({ code: 'LIMIT_REACHED', message: 'Bank account limit reached' });
    }
    const isDefault = count === 0 || dto.isDefault === true;
    const data = { ...this.fields(customerId, dto), customerId, isDefault };

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) await tx.customerBankAccount.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.customerBankAccount.create({ data });
    });
    return toBankAccount(created);
  }

  async update(customerId: string, id: string, dto: BankAccountDto) {
    const existing = await this.owned(customerId, id);
    const isDefault = existing.isDefault || dto.isDefault === true;
    const fields = this.fields(customerId, dto);
    // `undefined` keeps the current QR; `null` or a new key replaces it.
    const qrImageKey = dto.qrImageKey === undefined ? existing.qrImageKey : fields.qrImageKey;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isDefault && !existing.isDefault) {
        await tx.customerBankAccount.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.customerBankAccount.update({ where: { id }, data: { ...fields, qrImageKey, isDefault } });
    });
    if (existing.qrImageKey && existing.qrImageKey !== qrImageKey) await this.storage.remove(existing.qrImageKey);
    return toBankAccount(updated);
  }

  async setDefault(customerId: string, id: string) {
    await this.owned(customerId, id);
    await this.prisma.$transaction([
      this.prisma.customerBankAccount.updateMany({ where: { customerId }, data: { isDefault: false } }),
      this.prisma.customerBankAccount.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.list(customerId);
  }

  async remove(customerId: string, id: string) {
    const existing = await this.owned(customerId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.customerBankAccount.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.customerBankAccount.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.customerBankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    if (existing.qrImageKey) await this.storage.remove(existing.qrImageKey);
  }

  private async owned(customerId: string, id: string): Promise<CustomerBankAccount> {
    const account = await this.prisma.customerBankAccount.findFirst({ where: { id, customerId } });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  private fields(customerId: string, dto: BankAccountDto) {
    const accountNumber = normalizeAccountNumber(dto.accountNumber);
    if (!accountNumber) {
      throw new BadRequestException({ code: 'INVALID_ACCOUNT_NUMBER', message: 'Account number must be 6–20 digits' });
    }
    // Only keys this customer uploaded may be attached.
    if (dto.qrImageKey && !dto.qrImageKey.startsWith(qrPrefix(customerId))) {
      throw new BadRequestException({ code: 'INVALID_QR', message: 'Unknown QR image' });
    }
    return {
      bankCode: dto.bankCode,
      accountName: dto.accountName.trim(),
      accountNumber,
      qrImageKey: dto.qrImageKey ?? null,
    };
  }
}
