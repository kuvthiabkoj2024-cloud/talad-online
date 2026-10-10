import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_CART_QUANTITY } from '@talad/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { flashPrice, FlashSalePricingService, type FlashDiscount } from '../promotions/flash-sale-pricing.service.js';

const MAX_LINES = 100;

const lineInclude = {
  product: {
    select: {
      id: true,
      slug: true,
      name: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      stock: true,
      status: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
      category: { select: { commissionRate: true } },
      shop: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          ownerId: true,
          commissionRate: true,
          paymentWindowHrs: true,
        },
      },
      _count: { select: { variants: true } },
    },
  },
  variant: { select: { id: true, sku: true, attributes: true, price: true, stock: true } },
} satisfies Prisma.CartItemInclude;

type CartRow = Prisma.CartItemGetPayload<{ include: typeof lineInclude }>;

export interface CartLine {
  id: string;
  productId: string;
  productSlug: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  stock: number;
  /** False when the product was unpublished, the shop suspended, it sold out, the shop blocked this buyer — or it is the buyer's own. */
  available: boolean;
  /** The buyer owns this product's shop (shops can't buy from themselves). */
  ownShop: boolean;
  lineTotal: number;
  shop: { id: string; slug: string; name: string };
  /** Checkout-only details, not sent to clients. */
  internal: { commissionRate: number | null; paymentWindowHrs: number };
}

export interface CartShopGroup {
  shop: { id: string; slug: string; name: string };
  items: Omit<CartLine, 'internal' | 'shop'>[];
  subtotal: number;
}

/** Multi-shop cart (§4.4). Lines are stored per product/variant; prices are always current. */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly flash: FlashSalePricingService,
  ) {}

  /** Cart lines for the customer (optionally only `ids`), newest first. */
  async lines(customerId: string, ids?: string[]): Promise<CartLine[]> {
    const rows = await this.prisma.cartItem.findMany({
      where: { customerId, ...(ids && { id: { in: ids } }) },
      include: lineInclude,
      orderBy: { createdAt: 'desc' },
    });
    // Running flash sales set the price; shops can block abusive buyers (§3.5).
    const [discounts, blocks] = await Promise.all([
      this.flash.discounts(rows.map((r) => r.productId)),
      this.prisma.shopCustomerNote.findMany({
        where: { customerId, blacklisted: true, shopId: { in: [...new Set(rows.map((r) => r.product.shop.id))] } },
        select: { shopId: true },
      }),
    ]);
    const blocked = new Set(blocks.map((b) => b.shopId));
    return rows.map((r) => this.toLine(r, customerId, discounts.get(r.productId), blocked.has(r.product.shop.id)));
  }

  async view(customerId: string) {
    const lines = await this.lines(customerId);
    return { shops: groupByShop(lines), count: lines.reduce((n, l) => n + l.quantity, 0) };
  }

  /** Header badge: distinct items in the cart (each product/variant once), not units. */
  async count(customerId: string) {
    return { count: await this.prisma.cartItem.count({ where: { customerId } }) };
  }

  async add(customerId: string, productId: string, variantId: string | undefined, quantity: number) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, status: 'PUBLISHED', shop: { status: 'APPROVED' } },
      select: { stock: true, shop: { select: { id: true, ownerId: true } }, variants: { select: { id: true, stock: true } } },
    });
    if (!product) throw new NotFoundException({ code: 'PRODUCT_UNAVAILABLE', message: 'Product not available' });
    // Shop owners shop as customers too, but never from their own shop (fake sales/ratings).
    if (product.shop.ownerId === customerId) {
      throw new ForbiddenException({ code: 'OWN_PRODUCT', message: "You can't buy from your own shop" });
    }
    const note = await this.prisma.shopCustomerNote.findUnique({
      where: { shopId_customerId: { shopId: product.shop.id, customerId } },
      select: { blacklisted: true },
    });
    if (note?.blacklisted) {
      throw new ForbiddenException({ code: 'SHOP_BLOCKED', message: 'This shop is not accepting orders from your account' });
    }

    let stock = product.stock;
    if (product.variants.length) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (!variant) throw new BadRequestException({ code: 'OPTION_REQUIRED', message: 'Choose an option' });
      stock = variant.stock;
    } else if (variantId) {
      throw new BadRequestException({ code: 'OPTION_REQUIRED', message: 'Unknown option' });
    }
    if (stock < 1) throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'Out of stock' });

    const limit = Math.min(stock, MAX_CART_QUANTITY);
    // Look up manually: a NULL variantId never collides in the unique index.
    const existing = await this.prisma.cartItem.findFirst({
      where: { customerId, productId, variantId: variantId ?? null },
    });
    const item = existing
      ? await this.prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: Math.min(existing.quantity + quantity, limit) },
        })
      : await this.createLine(customerId, productId, variantId, Math.min(quantity, limit));

    return { itemId: item.id, ...(await this.count(customerId)) };
  }

  async setQuantity(customerId: string, id: string, quantity: number) {
    const line = (await this.lines(customerId, [id]))[0];
    if (!line) throw new NotFoundException('Cart item not found');
    if (quantity === 0) return this.remove(customerId, id);
    await this.prisma.cartItem.update({
      where: { id },
      data: { quantity: Math.max(1, Math.min(quantity, line.stock, MAX_CART_QUANTITY)) },
    });
    return this.count(customerId);
  }

  async remove(customerId: string, id: string) {
    await this.prisma.cartItem.deleteMany({ where: { id, customerId } });
    return this.count(customerId);
  }

  private async createLine(customerId: string, productId: string, variantId: string | undefined, quantity: number) {
    const lines = await this.prisma.cartItem.count({ where: { customerId } });
    if (lines >= MAX_LINES) throw new BadRequestException({ code: 'CART_FULL', message: 'Cart is full' });
    return this.prisma.cartItem.create({ data: { customerId, productId, variantId: variantId ?? null, quantity } });
  }

  private toLine(r: CartRow, customerId: string, flash?: FlashDiscount, blocked = false): CartLine {
    const { product, variant } = r;
    const regular = (variant?.price ?? product.price).toNumber();
    const unitPrice = flash ? flashPrice(regular, flash.percent) : regular;
    const stock = variant ? variant.stock : product.stock;
    const attributes = variant?.attributes as Record<string, string> | undefined;
    const needsVariant = product._count.variants > 0 && !variant;
    const ownShop = product.shop.ownerId === customerId;
    return {
      id: r.id,
      productId: product.id,
      productSlug: product.slug,
      variantId: variant?.id ?? null,
      name: product.name,
      variantLabel: attributes ? Object.values(attributes).join(' / ') : null,
      sku: variant?.sku ?? product.sku,
      imageUrl: product.images[0] ? this.media.publicUrl(product.images[0].key) : null,
      unitPrice,
      compareAtPrice: flash ? Math.max(product.compareAtPrice?.toNumber() ?? 0, regular) : (product.compareAtPrice?.toNumber() ?? null),
      quantity: r.quantity,
      stock,
      available:
        product.status === 'PUBLISHED' &&
        product.shop.status === 'APPROVED' &&
        stock > 0 &&
        !needsVariant &&
        !ownShop &&
        !blocked,
      ownShop,
      lineTotal: unitPrice * r.quantity,
      shop: { id: product.shop.id, slug: product.shop.slug, name: product.shop.name },
      internal: {
        commissionRate: (product.shop.commissionRate ?? product.category.commissionRate)?.toNumber() ?? null,
        paymentWindowHrs: product.shop.paymentWindowHrs,
      },
    };
  }
}

/** Groups lines by shop (in first-seen order) and totals the available ones. */
export function groupByShop(lines: CartLine[]): CartShopGroup[] {
  const groups = new Map<string, CartShopGroup>();
  for (const { internal: _internal, shop, ...item } of lines) {
    const group = groups.get(shop.id) ?? { shop, items: [], subtotal: 0 };
    group.items.push(item);
    if (item.available) group.subtotal += item.lineTotal;
    groups.set(shop.id, group);
  }
  return [...groups.values()];
}
