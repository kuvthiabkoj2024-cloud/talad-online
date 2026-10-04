import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMER_LIMITS, normalizePhone } from '@talad/shared';
import type { Address } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AddressDto } from './dto/customer-profile.dto.js';

export function toAddress(a: Address) {
  return {
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    province: a.province,
    district: a.district,
    village: a.village,
    line: a.line,
    isDefault: a.isDefault,
  };
}

/** A customer's saved delivery addresses (§4.2). Exactly one is the default once any exist. */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(customerId: string) {
    const rows = await this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAddress);
  }

  async create(customerId: string, dto: AddressDto) {
    const count = await this.prisma.address.count({ where: { customerId } });
    if (count >= CUSTOMER_LIMITS.maxAddresses) {
      throw new BadRequestException({ code: 'LIMIT_REACHED', message: 'Address limit reached' });
    }
    const isDefault = count === 0 || dto.isDefault === true;
    const data = { ...this.fields(dto), customerId, isDefault };

    const created = await this.prisma.$transaction(async (tx) => {
      if (isDefault) await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      return tx.address.create({ data });
    });
    return toAddress(created);
  }

  async update(customerId: string, id: string, dto: AddressDto) {
    const existing = await this.owned(customerId, id);
    // The default can only move by choosing another address, never by switching it off.
    const isDefault = existing.isDefault || dto.isDefault === true;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (isDefault && !existing.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.address.update({ where: { id }, data: { ...this.fields(dto), isDefault } });
    });
    return toAddress(updated);
  }

  async setDefault(customerId: string, id: string) {
    await this.owned(customerId, id);
    await this.prisma.$transaction([
      this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return this.list(customerId);
  }

  async remove(customerId: string, id: string) {
    const existing = await this.owned(customerId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { customerId }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  private async owned(customerId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, customerId } });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  private fields(dto: AddressDto) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Enter a valid Lao mobile number' });
    return {
      label: dto.label ?? null,
      recipientName: dto.recipientName.trim(),
      phone,
      province: dto.province,
      district: dto.district.trim(),
      village: dto.village?.trim() || null,
      line: dto.line.trim(),
    };
  }
}
