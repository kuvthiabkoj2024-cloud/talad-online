import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SHOP_PROFILE_RULES, type BankCode } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { AdminUser, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';

const KEY = 'paymentAccount';
const qrPrefix = () => filePrefix(storageFolder.platformPayments(), 'payment-qr');

/** Taladonline's account that customers transfer to (`Setting.paymentAccount`). */
export interface PlatformAccount {
  bankCode: BankCode | null;
  accountName: string | null;
  accountNumber: string | null;
  hasQr: boolean;
}

type Stored = { bankCode?: BankCode | null; accountName?: string | null; accountNumber?: string | null; qrKey?: string | null };

/**
 * Where customers pay transfers: one Taladonline account (QR and/or bank details) for every
 * order. Admins check the slips against it and pay shops their share as payouts.
 */
@Injectable()
export class PlatformAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async stored(): Promise<Stored> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    return (row?.value ?? {}) as Stored;
  }

  async get(): Promise<PlatformAccount> {
    const s = await this.stored();
    return { bankCode: s.bankCode ?? null, accountName: s.accountName ?? null, accountNumber: s.accountNumber ?? null, hasQr: !!s.qrKey };
  }

  /** Transfers can be offered once there is a QR or a full account to send to. */
  async available(): Promise<PlatformAccount | null> {
    const a = await this.get();
    return a.hasQr || (a.accountName && a.accountNumber) ? a : null;
  }

  async save(admin: AdminUser, input: { bankCode: BankCode | null; accountName: string | null; accountNumber: string | null }): Promise<PlatformAccount> {
    const before = await this.stored();
    await this.write({ ...before, ...input });
    await this.audit.log({ adminId: admin.id, action: 'settings.paymentAccount', entityType: 'Setting', entityId: KEY, changes: { before: { ...before, qrKey: undefined }, after: input } });
    return this.get();
  }

  async uploadQr(admin: AdminUser, file: Express.Multer.File | undefined): Promise<PlatformAccount> {
    if (!file) throw new BadRequestException({ code: 'QR_REQUIRED', message: 'No file uploaded' });
    if (file.size > SHOP_PROFILE_RULES.imageMaxBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 5 MB or smaller' });
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Upload a PNG, JPG or WebP image' });
    const key = `${qrPrefix()}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    const before = await this.stored();
    await this.write({ ...before, qrKey: key });
    if (before.qrKey) await this.storage.remove(before.qrKey).catch(() => {});
    await this.audit.log({ adminId: admin.id, action: 'settings.paymentQr', entityType: 'Setting', entityId: KEY });
    return this.get();
  }

  async removeQr(admin: AdminUser): Promise<PlatformAccount> {
    const before = await this.stored();
    if (before.qrKey) {
      await this.write({ ...before, qrKey: null });
      await this.storage.remove(before.qrKey).catch(() => {});
      await this.audit.log({ adminId: admin.id, action: 'settings.paymentQr.remove', entityType: 'Setting', entityId: KEY });
    }
    return this.get();
  }

  async qr() {
    const { qrKey } = await this.stored();
    if (!qrKey) throw new NotFoundException('No payment QR');
    return this.storage.get(qrKey);
  }

  private async write(value: Stored) {
    const json = value as Prisma.InputJsonObject;
    await this.prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
  }
}
