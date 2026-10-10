import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProductStatus } from '@talad/shared';
import type { OrderStatus, Shop } from '../../generated/prisma/client.js';
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

export interface ShopSummary {
  orders: { toPay: number; toShip: number; shipping: number; cancelled: number; returns: number; completed: number };
  products: { published: number; pending: number; draft: number; rejected: number; lowStock: number };
  activeCoupons: number;
  /** Profile pieces the shop still needs, for the setup reminders. */
  setup: { pickupAddress: boolean; payment: boolean; logo: boolean };
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

  /** Seller Center home: what needs attention (§3.6, §3.3). */
  async summary(shop: Shop): Promise<ShopSummary> {
    const [orders, products, coupons] = await Promise.all([
      this.prisma.shopOrder.groupBy({ by: ['status'], where: { shopId: shop.id }, _count: { _all: true } }),
      this.prisma.product.findMany({
        where: { shopId: shop.id },
        select: { status: true, stock: true, lowStockThreshold: true, variants: { select: { stock: true } } },
      }),
      this.prisma.coupon.findMany({
        where: { shopId: shop.id, isActive: true, endsAt: { gt: new Date() } },
        select: { usageLimit: true, usedCount: true },
      }),
    ]);
    const ordersIn = (...statuses: OrderStatus[]) =>
      orders.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
    const productsIn = (status: ProductStatus) => products.filter((p) => p.status === status).length;

    return {
      orders: {
        toPay: ordersIn('PENDING'),
        toShip: ordersIn('CONFIRMED', 'PACKED'),
        shipping: ordersIn('SHIPPED', 'DELIVERED'),
        cancelled: ordersIn('CANCELLED'),
        returns: ordersIn('RETURN_REQUESTED'),
        completed: ordersIn('COMPLETED'),
      },
      products: {
        published: productsIn('PUBLISHED'),
        pending: productsIn('PENDING'),
        draft: productsIn('DRAFT'),
        rejected: productsIn('REJECTED'),
        lowStock: products.filter((p) => {
          if (p.status !== 'PUBLISHED') return false;
          const stock = p.variants.length ? p.variants.reduce((sum, v) => sum + v.stock, 0) : p.stock;
          return stock <= p.lowStockThreshold;
        }).length,
      },
      activeCoupons: coupons.filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit).length,
      setup: {
        pickupAddress: Boolean(shop.address),
        payment: Boolean(shop.paymentAccountNumber || shop.paymentQrKey),
        logo: Boolean(shop.logoUrl),
      },
    };
  }

  async products(slug: string, q: string | undefined, sort: ShopProductSort, page: number, pageSize: number) {
    const shop = await this.prisma.shop.findFirst({ where: { slug, status: 'APPROVED' }, select: { id: true } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.catalog.searchShop(shop.id, q, sort, page, pageSize);
  }
}
