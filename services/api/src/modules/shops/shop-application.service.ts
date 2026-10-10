import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizePhone, SHOP_RULES, type KycDocumentType } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { Prisma, type Customer, type ShopStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectDocument } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import type { ShopApplicationDto } from './shop-application.dto.js';

export interface ShopApplication {
  id: string;
  status: ShopStatus;
  rejectionReason: string | null;
  name: string;
  slug: string;
  description: string | null;
  ownerName: string;
  email: string;
  phone: string;
  address: string | null;
  documents: { id: string; type: KycDocumentType; key: string; createdAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
}

/** Statuses in which the owner may still change the application. */
const EDITABLE: ShopStatus[] = ['PENDING', 'REJECTED'];

const kycPrefix = (customerId: string) => filePrefix(storageFolder.customerKyc(customerId), 'kyc');

/**
 * Opening a shop (§3.1): an account applies with business details, a pickup address and
 * KYC documents; the shop starts PENDING until an admin approves it (§2.3). A rejected
 * application can be corrected and sent again.
 */
@Injectable()
export class ShopApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(customerId: string): Promise<ShopApplication> {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId: customerId },
      include: { kycDocuments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!shop) throw new NotFoundException({ code: 'NO_SHOP', message: 'This account has no shop' });
    return {
      id: shop.id,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      name: shop.name,
      slug: shop.slug,
      description: shop.description,
      ownerName: shop.ownerName,
      email: shop.email,
      phone: shop.phone,
      address: shop.address,
      documents: shop.kycDocuments.map((d) => ({ id: d.id, type: d.type, key: d.fileKey, createdAt: d.createdAt })),
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }

  /** Whether a storefront address is free (for the live check while typing). */
  async slugAvailable(customerId: string, slug: string): Promise<{ available: boolean; valid: boolean }> {
    const value = slug.trim().toLowerCase();
    if (!SHOP_RULES.slugPattern.test(value)) return { available: false, valid: false };
    const taken = await this.prisma.shop.findFirst({
      where: { slug: value, NOT: { ownerId: customerId } },
      select: { id: true },
    });
    return { available: !taken, valid: true };
  }

  /** Stores a KYC file privately under the account; it's attached when the application is sent. */
  async uploadDocument(customerId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: 'No file uploaded' });
    if (file.size > SHOP_RULES.kycMaxBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File must be 5 MB or smaller' });
    }
    const kind = detectDocument(file.buffer);
    if (!kind) throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: 'Upload a JPG, PNG, WebP or PDF' });
    const key = `${kycPrefix(customerId)}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    return { key };
  }

  /** Streams one of the applicant's own documents back (for "view" in the form). */
  async document(customerId: string, id: string) {
    const doc = await this.prisma.shopKycDocument.findFirst({ where: { id, shop: { ownerId: customerId } } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.storage.get(doc.fileKey);
  }

  async create(customer: Customer, dto: ShopApplicationDto): Promise<ShopApplication> {
    if (await this.prisma.shop.findUnique({ where: { ownerId: customer.id }, select: { id: true } })) {
      throw new ConflictException({ code: 'ALREADY_HAS_SHOP', message: 'This account already has a shop' });
    }
    const fields = await this.validate(customer.id, dto, null, []);
    try {
      await this.prisma.shop.create({
        data: {
          ...fields,
          ownerId: customer.id,
          status: 'PENDING',
          kycDocuments: { create: dto.documents.map((d) => ({ type: d.type, fileKey: d.key })) },
        },
      });
    } catch (e) {
      throw this.conflict(e);
    }
    return this.get(customer.id);
  }

  /** Correct a pending or rejected application; it goes (back) to PENDING for review. */
  async update(customer: Customer, dto: ShopApplicationDto): Promise<ShopApplication> {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId: customer.id },
      include: { kycDocuments: true },
    });
    if (!shop) throw new NotFoundException({ code: 'NO_SHOP', message: 'This account has no shop' });
    if (!EDITABLE.includes(shop.status)) {
      throw new ConflictException({ code: 'APPLICATION_CLOSED', message: 'An approved shop is edited from its profile' });
    }
    const existing = shop.kycDocuments.map((d) => d.fileKey);
    const fields = await this.validate(customer.id, dto, shop.id, existing);

    const keep = new Set(dto.documents.map((d) => d.key));
    const dropped = shop.kycDocuments.filter((d) => !keep.has(d.fileKey));
    const added = dto.documents.filter((d) => !existing.includes(d.key));
    try {
      await this.prisma.$transaction([
        this.prisma.shopKycDocument.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } }),
        ...dto.documents
          .filter((d) => existing.includes(d.key))
          .map((d) =>
            this.prisma.shopKycDocument.updateMany({ where: { shopId: shop.id, fileKey: d.key }, data: { type: d.type } }),
          ),
        this.prisma.shop.update({
          where: { id: shop.id },
          data: {
            ...fields,
            status: 'PENDING',
            rejectionReason: null,
            kycDocuments: { create: added.map((d) => ({ type: d.type, fileKey: d.key })) },
          },
        }),
      ]);
    } catch (e) {
      throw this.conflict(e);
    }
    await Promise.all(dropped.map((d) => this.storage.remove(d.fileKey)));
    return this.get(customer.id);
  }

  private async validate(customerId: string, dto: ShopApplicationDto, shopId: string | null, existingKeys: string[]) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException({ code: 'INVALID_PHONE', message: 'Enter a valid Lao phone number' });

    if (!dto.documents.some((d) => d.type === 'NATIONAL_ID')) {
      throw new BadRequestException({ code: 'ID_REQUIRED', message: 'Add the owner’s ID card or passport' });
    }
    const keys = dto.documents.map((d) => d.key);
    const own = kycPrefix(customerId);
    if (new Set(keys).size !== keys.length || keys.some((k) => !k.startsWith(own) && !existingKeys.includes(k))) {
      throw new BadRequestException({ code: 'INVALID_DOCUMENT', message: 'Unknown document file' });
    }

    // Unique business identity; checked up front so the seller gets a precise message.
    const others = shopId ? { NOT: { id: shopId } } : {};
    const [slug, email, phoneTaken] = await Promise.all([
      this.prisma.shop.findFirst({ where: { slug: dto.slug, ...others }, select: { id: true } }),
      this.prisma.shop.findFirst({ where: { email: dto.email, ...others }, select: { id: true } }),
      this.prisma.shop.findFirst({ where: { phone, ...others }, select: { id: true } }),
    ]);
    if (slug) throw new ConflictException({ code: 'SLUG_TAKEN', message: 'This shop address is taken' });
    if (email) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Another shop uses this email' });
    if (phoneTaken) throw new ConflictException({ code: 'PHONE_TAKEN', message: 'Another shop uses this phone number' });

    return {
      name: dto.name,
      slug: dto.slug,
      description: dto.description || null,
      ownerName: dto.ownerName,
      email: dto.email,
      phone,
      address: dto.address,
    };
  }

  /** A race lost to another applicant between the check and the write. */
  private conflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException({ code: 'ALREADY_TAKEN', message: 'Shop address, email or phone is already used' });
    }
    return e;
  }
}
