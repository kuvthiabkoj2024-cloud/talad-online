import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ProductsService, type ShopProductSort } from '../catalog/products/products.service.js';
import { MediaService } from '../media/media.service.js';

export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  productCount: number;
  ratingAvg: number;
  ratingCount: number;
  joinedAt: Date;
}

/** Public shop storefront (§3.2): profile + searchable product listing. */
@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductsService,
    private readonly media: MediaService,
  ) {}

  /** Only approved shops, and only fields meant for the public — never contact or payment data. */
  async profile(slug: string): Promise<PublicShop> {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, status: 'APPROVED' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        logoUrl: true,
        coverUrl: true,
        verifiedAt: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      description: shop.description,
      logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
      coverUrl: shop.coverUrl ? this.media.publicUrl(shop.coverUrl) : null,
      verified: shop.verifiedAt !== null,
      productCount: shop._count.products,
      ratingAvg: shop.ratingAvg.toNumber(),
      ratingCount: shop.ratingCount,
      joinedAt: shop.createdAt,
    };
  }

  /** The shop an account owns, with owner-only fields (status, contact). */
  async ownedBy(customerId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId: customerId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        rejectionReason: true,
        description: true,
        logoUrl: true,
        email: true,
        phone: true,
        verifiedAt: true,
        createdAt: true,
      },
    });
    if (!shop) throw new NotFoundException({ code: 'NO_SHOP', message: 'This account has no shop' });
    return { ...shop, logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null };
  }

  async products(slug: string, q: string | undefined, sort: ShopProductSort, page: number, pageSize: number) {
    const shop = await this.prisma.shop.findFirst({ where: { slug, status: 'APPROVED' }, select: { id: true } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.catalog.searchShop(shop.id, q, sort, page, pageSize);
  }
}
