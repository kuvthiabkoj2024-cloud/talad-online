import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMER_LIMITS } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { avatarPrefix, toProfile, withShop } from '../auth/customer-auth.service.js';
import { detectImage } from '../media/image-type.js';
import { StorageService } from '../media/storage.service.js';
import type { ProfileDto } from './dto/customer-profile.dto.js';

/** The signed-in customer's own profile: name, email and photo (§4.2). */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async update(customerId: string, dto: ProfileDto) {
    const email = dto.email?.trim().toLowerCase() || null;
    try {
      const customer = await this.prisma.customer.update({
        where: { id: customerId },
        data: { name: dto.name.trim(), email },
        include: withShop,
      });
      return toProfile(customer);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email already in use' });
      }
      throw e;
    }
  }

  async setAvatar(customerId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'INVALID_QR', message: 'No file uploaded' });
    if (file.size > CUSTOMER_LIMITS.qrMaxBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 2 MB or smaller' });
    }
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException({ code: 'INVALID_QR', message: 'Upload a PNG, JPG or WebP image' });

    const key = `${avatarPrefix(customerId)}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    const previous = await this.storedAvatar(customerId);
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { avatarUrl: key },
      include: withShop,
    });
    if (previous) await this.storage.remove(previous);
    return toProfile(customer);
  }

  async removeAvatar(customerId: string) {
    const previous = await this.storedAvatar(customerId);
    const customer = await this.prisma.customer.update({
      where: { id: customerId },
      data: { avatarUrl: null },
      include: withShop,
    });
    if (previous) await this.storage.remove(previous);
    return toProfile(customer);
  }

  /** Public: uploaded profile photos appear next to reviews and in the header. */
  async avatar(customerId: string) {
    const key = await this.storedAvatar(customerId);
    if (!key) throw new NotFoundException();
    return this.storage.get(key);
  }

  private async storedAvatar(customerId: string): Promise<string | null> {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { avatarUrl: true } });
    return c?.avatarUrl?.startsWith(avatarPrefix(customerId)) ? c.avatarUrl : null;
  }
}
