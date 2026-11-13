import { Injectable, NotFoundException } from '@nestjs/common';
import { normalizePhone, type OrderStatus } from '@talad/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';

/** What anyone with the order number and its phone number may see: where the parcel is, nothing private. */
export interface TrackedOrder {
  number: string;
  status: OrderStatus;
  createdAt: Date;
  shop: { slug: string; name: string; logoUrl: string | null };
  items: { name: string; variant: string | null; quantity: number; imageUrl: string | null }[];
  itemCount: number;
  /** Delivered to (province code and district): no street, no name, no phone. */
  destination: { province: string; district: string } | null;
  pickup: boolean;
  urgentDelivery: boolean;
  deliveryProvider: string | null;
  trackingNumber: string | null;
  autoConfirmAt: Date | null;
  /** Status changes, oldest first (without notes: those can be private). */
  history: { status: OrderStatus; at: Date }[];
}

const notFound = () => new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No order with this number and phone number' });

/**
 * Order tracking (§3.4 "real-time tracking"): the order number plus a phone number on the order
 * (the delivery address's, or the buyer's account) — so the person receiving a parcel can follow
 * it too. A wrong number and a wrong phone give the same answer, so orders can't be probed.
 */
@Injectable()
export class OrderTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async track(number: string, phoneInput: string): Promise<TrackedOrder> {
    const phone = normalizePhone(phoneInput);
    if (!phone) throw notFound();
    const o = await this.prisma.shopOrder.findUnique({
      where: { number: number.trim().toUpperCase() },
      select: {
        number: true,
        status: true,
        createdAt: true,
        pickup: true,
        urgentDelivery: true,
        trackingNumber: true,
        autoConfirmAt: true,
        order: { select: { shippingAddress: true, customer: { select: { phone: true } } } },
        shop: { select: { slug: true, name: true, logoUrl: true } },
        deliveryProvider: { select: { name: true } },
        items: {
          select: {
            name: true,
            quantity: true,
            variant: { select: { attributes: true } },
            product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } },
          },
        },
        history: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
      },
    });
    if (!o) throw notFound();
    const address = o.order.shippingAddress as { phone?: string; province?: string; district?: string } | null;
    const phones = [address?.phone && normalizePhone(address.phone), o.order.customer.phone].filter(Boolean);
    if (!phones.includes(phone)) throw notFound();

    return {
      number: o.number,
      status: o.status,
      createdAt: o.createdAt,
      shop: { slug: o.shop.slug, name: o.shop.name, logoUrl: o.shop.logoUrl ? this.media.publicUrl(o.shop.logoUrl) : null },
      items: o.items.map((i) => {
        const attributes = i.variant?.attributes as Record<string, string> | undefined;
        const image = i.product.images[0];
        return {
          name: i.name,
          variant: attributes ? Object.values(attributes).join(' / ') : null,
          quantity: i.quantity,
          imageUrl: image ? this.media.publicUrl(image.key) : null,
        };
      }),
      itemCount: o.items.length,
      destination: address?.province ? { province: address.province, district: address.district ?? '' } : null,
      pickup: o.pickup,
      urgentDelivery: o.urgentDelivery,
      deliveryProvider: o.deliveryProvider?.name ?? null,
      trackingNumber: o.trackingNumber,
      autoConfirmAt: o.status === 'SHIPPED' || o.status === 'DELIVERED' ? o.autoConfirmAt : null,
      history: o.history.map((h) => ({ status: h.toStatus, at: h.createdAt })),
    };
  }
}
