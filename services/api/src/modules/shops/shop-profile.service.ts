import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BANK_CODES,
  geoPoint,
  type GeoPoint,
  normalizeAccountNumber,
  normalizePhone,
  SHOP_PROFILE_RULES,
  SOCIAL_LINKS,
  WEEKDAYS,
  type BusinessHours,
  type SocialLink,
  parseUrgentDelivery,
  type UrgentDelivery,
} from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { Prisma, Shop } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectImage } from '../media/image-type.js';
import { MediaService } from '../media/media.service.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import type { ShopProfileDto, UrgentDeliveryDto } from './shop-profile.dto.js';

export type ProfileImage = 'logo' | 'cover' | 'payment-qr';

export interface ShopProfile {
  id: string;
  slug: string;
  status: Shop['status'];
  name: string;
  description: string | null;
  ownerName: string;
  email: string | null;
  phone: string;
  address: string | null;
  /** Pinned on the map: where urgent delivery distances are measured from. */
  location: GeoPoint | null;
  logoUrl: string | null;
  coverUrl: string | null;
  businessHours: BusinessHours;
  socialLinks: Partial<Record<SocialLink, string>>;
  payment: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean };
  paymentWindowHrs: number;
  autoConfirmHrs: number;
  /** Cash on delivery offered, and when the owner last accepted its terms. */
  cod: { enabled: boolean; termsAcceptedAt: Date | null };
  /** The shop's own urgent delivery (areas, prices, how fast). */
  urgentDelivery: UrgentDelivery;
  /** Customers may collect their orders at the shop. */
  pickupEnabled: boolean;
  /** Every active courier, and whether the shop ships with it (customers only see those it does). */
  deliveryProviders: { id: string; code: string; name: string; logoUrl: string | null; enabled: boolean }[];
  verifiedAt: Date | null;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The owner's view and edit of the shop profile (§3.2) and payment / deadline settings. */
@Injectable()
export class ShopProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  async get(shop: Shop): Promise<ShopProfile> {
    const providers = await this.prisma.deliveryProvider.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, logoUrl: true },
      orderBy: { createdAt: 'asc' },
    });
    const disabled = new Set(shop.disabledDeliveryProviderIds);
    return {
      id: shop.id,
      slug: shop.slug,
      status: shop.status,
      name: shop.name,
      description: shop.description,
      ownerName: shop.ownerName,
      email: shop.email,
      phone: shop.phone,
      address: shop.address,
      location: geoPoint(shop.latitude, shop.longitude),
      logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
      coverUrl: shop.coverUrl ? this.media.publicUrl(shop.coverUrl) : null,
      businessHours: (shop.businessHours ?? {}) as BusinessHours,
      socialLinks: (shop.socialLinks ?? {}) as Partial<Record<SocialLink, string>>,
      payment: {
        bankCode: shop.paymentBankCode,
        accountName: shop.paymentAccountName,
        accountNumber: shop.paymentAccountNumber,
        hasQr: shop.paymentQrKey !== null,
      },
      paymentWindowHrs: shop.paymentWindowHrs,
      autoConfirmHrs: shop.autoConfirmHrs,
      cod: { enabled: shop.codEnabled, termsAcceptedAt: shop.codTermsAcceptedAt },
      urgentDelivery: parseUrgentDelivery(shop.urgentDelivery) ?? { enabled: false, eta: '', zones: [], freeRadiusKm: 0 },
      pickupEnabled: shop.pickupEnabled,
      deliveryProviders: providers.map((p) => ({ ...p, enabled: !disabled.has(p.id) })),
      verifiedAt: shop.verifiedAt,
    };
  }

  async update(shop: Shop, dto: ShopProfileDto): Promise<ShopProfile> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Enter a valid Lao phone number' });

    const accountNumber = dto.paymentAccountNumber ? normalizeAccountNumber(dto.paymentAccountNumber) : null;
    if (dto.paymentAccountNumber && !accountNumber) {
      throw new BadRequestException({ code: 'INVALID_ACCOUNT_NUMBER', message: 'Account numbers are 6–20 digits' });
    }
    if (dto.paymentBankCode && !(BANK_CODES as string[]).includes(dto.paymentBankCode)) {
      throw new BadRequestException({ code: 'INVALID_BANK', message: 'Unknown bank' });
    }

    // Turning COD on means accepting its terms (MC Mart is not responsible for COD
    // losses); the acceptance time is kept as the record.
    const turningCodOn = dto.codEnabled === true && !shop.codEnabled;
    if (turningCodOn && !dto.codTermsAccepted) {
      throw new BadRequestException({ code: 'COD_TERMS_REQUIRED', message: 'Accept the cash on delivery terms to offer COD' });
    }

    // The pin moves only as a pair; null clears it.
    const pinChange = dto.latitude !== undefined || dto.longitude !== undefined;
    const pin = pinChange ? geoPoint(dto.latitude, dto.longitude) : geoPoint(shop.latitude, shop.longitude);
    if (pinChange && !pin && (dto.latitude != null || dto.longitude != null)) {
      throw new BadRequestException({ code: 'INVALID_LOCATION', message: 'Pin the shop on the map again' });
    }
    const urgent = dto.urgentDelivery && this.urgent(dto.urgentDelivery, pin);
    const disabledProviders = dto.disabledDeliveryProviderIds && (await this.disabledProviders(dto.disabledDeliveryProviderIds));

    const [email, phoneTaken] = await Promise.all([
      dto.email ? this.prisma.shop.findFirst({ where: { email: dto.email, NOT: { id: shop.id } }, select: { id: true } }) : null,
      this.prisma.shop.findFirst({ where: { phone, NOT: { id: shop.id } }, select: { id: true } }),
    ]);
    if (email) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Another shop uses this email' });
    if (phoneTaken) throw new ConflictException({ code: 'PHONE_TAKEN', message: 'Another shop uses this phone number' });

    const updated = await this.prisma.shop.update({
      where: { id: shop.id },
      data: {
        name: dto.name,
        description: dto.description || null,
        email: dto.email || null,
        phone,
        address: dto.address,
        ...(pinChange && { latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null }),
        businessHours: this.hours(dto.businessHours),
        socialLinks: this.links(dto.socialLinks),
        paymentBankCode: dto.paymentBankCode || null,
        paymentAccountName: dto.paymentAccountName?.trim() || null,
        paymentAccountNumber: accountNumber,
        paymentWindowHrs: dto.paymentWindowHrs,
        autoConfirmHrs: dto.autoConfirmHrs,
        ...(dto.codEnabled !== undefined && { codEnabled: dto.codEnabled }),
        ...(turningCodOn && { codTermsAcceptedAt: new Date() }),
        ...(dto.pickupEnabled !== undefined && { pickupEnabled: dto.pickupEnabled }),
        ...(disabledProviders && { disabledDeliveryProviderIds: disabledProviders }),
        ...(urgent && { urgentDelivery: urgent as unknown as Prisma.InputJsonValue }),
      },
    });
    return this.get(updated);
  }

  /**
   * Couriers turned off, as stored: only real couriers' ids. At least one active courier has
   * to stay on, or customers ordering by courier would have no way to get the order.
   */
  private async disabledProviders(ids: string[]): Promise<string[]> {
    const active = await this.prisma.deliveryProvider.findMany({ where: { isActive: true }, select: { id: true } });
    const off = new Set(ids);
    if (active.length > 0 && active.every((p) => off.has(p.id))) {
      throw new BadRequestException({ code: 'DELIVERY_PROVIDER_REQUIRED', message: 'Keep at least one delivery service on' });
    }
    // Inactive couriers stay in the list: if an admin turns one back on, the shop's choice holds.
    const known = await this.prisma.deliveryProvider.findMany({ where: { id: { in: [...off] } }, select: { id: true } });
    return known.map((p) => p.id);
  }

  /**
   * Urgent delivery as stored: tidy zones. It can only be on with somewhere to deliver to (an
   * area, or a free radius); a free radius is measured from the shop's pin, so it needs one.
   */
  private urgent(dto: UrgentDeliveryDto, pin: GeoPoint | null): UrgentDelivery {
    const parsed = parseUrgentDelivery(dto)!;
    if (parsed.freeRadiusKm > 0 && !pin) {
      throw new BadRequestException({ code: 'SHOP_LOCATION_REQUIRED', message: 'Pin the shop on the map to offer free delivery nearby' });
    }
    if (parsed.enabled && parsed.zones.length === 0 && parsed.freeRadiusKm === 0) {
      throw new BadRequestException({ code: 'URGENT_ZONE_REQUIRED', message: 'Add at least one area for urgent delivery' });
    }
    return parsed;
  }

  /** Replaces the logo, cover photo or payment QR; the old file is deleted. */
  async upload(shop: Shop, kind: ProfileImage, file: Express.Multer.File | undefined): Promise<ShopProfile> {
    if (!file) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'No file uploaded' });
    if (file.size > SHOP_PROFILE_RULES.imageMaxBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 5 MB or smaller' });
    }
    const type = detectImage(file.buffer);
    if (!type) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Upload a PNG, JPG or WebP image' });
    const key = `${filePrefix(storageFolder.shopProfile(shop.id), kind)}${randomUUID()}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.type);
    const updated = await this.prisma.shop.update({ where: { id: shop.id }, data: { [this.column(kind)]: key } });
    await this.removeOwn(shop, shop[this.column(kind)]);
    return this.get(updated);
  }

  async removeImage(shop: Shop, kind: ProfileImage): Promise<ShopProfile> {
    const updated = await this.prisma.shop.update({ where: { id: shop.id }, data: { [this.column(kind)]: null } });
    await this.removeOwn(shop, shop[this.column(kind)]);
    return this.get(updated);
  }

  /** The private payment QR, for the owner to check what customers see. */
  async paymentQr(shop: Shop) {
    if (!shop.paymentQrKey) throw new NotFoundException('No payment QR');
    return this.storage.get(shop.paymentQrKey);
  }

  private column(kind: ProfileImage) {
    return ({ logo: 'logoUrl', cover: 'coverUrl', 'payment-qr': 'paymentQrKey' } as const)[kind];
  }

  /** Only files in the shop's own folder (not seeded URLs) are deleted. */
  private async removeOwn(shop: Shop, key: string | null) {
    if (key?.startsWith(storageFolder.shopProfile(shop.id))) await this.storage.remove(key);
  }

  private hours(input: unknown): BusinessHours {
    const out: BusinessHours = {};
    if (!input || typeof input !== 'object') return out;
    for (const day of WEEKDAYS) {
      const v = (input as Record<string, unknown>)[day] as { open?: unknown; close?: unknown } | null | undefined;
      if (!v) continue;
      if (typeof v.open !== 'string' || typeof v.close !== 'string' || !TIME.test(v.open) || !TIME.test(v.close) || v.open >= v.close) {
        throw new BadRequestException({ code: 'INVALID_HOURS', message: `Check the opening hours for ${day}` });
      }
      out[day] = { open: v.open, close: v.close };
    }
    return out;
  }

  private links(input: unknown): Partial<Record<SocialLink, string>> {
    const out: Partial<Record<SocialLink, string>> = {};
    if (!input || typeof input !== 'object') return out;
    for (const key of SOCIAL_LINKS) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.trim()) {
        if (v.length > 200) throw new BadRequestException({ code: 'INVALID_LINK', message: `${key} is too long` });
        out[key] = v.trim();
      }
    }
    return out;
  }
}
