import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMER_LIMITS, SLIP_PAYMENT_METHODS } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { Payment, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';

/** Storage prefix for a customer's uploaded transfer slips. */
export const slipPrefix = (customerId: string) => filePrefix(storageFolder.customerPayments(customerId), 'slip');

const withPayments = {
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  shop: { select: { paymentQrKey: true } },
  order: {
    select: {
      shopOrders: { select: { id: true } },
      payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  },
} satisfies Prisma.ShopOrderInclude;

type ShopOrderWithPayments = Prisma.ShopOrderGetPayload<{ include: typeof withPayments }>;

/**
 * The payment belonging to a shop order: its own (manual transfer / COD per shop),
 * or — for older single-shop checkouts — the order-level payment.
 */
export function paymentOf(o: {
  payments: Payment[];
  order: { shopOrders: { id: string }[]; payments: Payment[] };
}): Payment | null {
  return o.payments[0] ?? (o.order.shopOrders.length === 1 ? (o.order.payments[0] ?? null) : null);
}

/** Manual payments (§6): customers transfer to the shop's QR and upload the slip. */
@Injectable()
export class PaymentSlipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Checkout: slip uploaded before the order exists. Returns the key to send with the order. */
  async uploadCheckoutSlip(customerId: string, file: Express.Multer.File | undefined) {
    return { slipKey: await this.store(customerId, file) };
  }

  /** The shop's receiving QR image, shown to signed-in customers at checkout. */
  async shopQr(shopId: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, status: 'APPROVED' },
      select: { paymentQrKey: true },
    });
    if (!shop?.paymentQrKey) throw new NotFoundException('This shop has no payment QR');
    return this.storage.get(shop.paymentQrKey);
  }

  async orderQr(customerId: string, number: string) {
    const o = await this.owned(customerId, number);
    if (!o.shop.paymentQrKey) throw new NotFoundException('This shop has no payment QR');
    return this.storage.get(o.shop.paymentQrKey);
  }

  /** Pay later / replace a wrong slip on an order that is still awaiting payment. */
  async attachSlip(customerId: string, number: string, file: Express.Multer.File | undefined) {
    const o = await this.owned(customerId, number);
    const payment = paymentOf(o);
    if (
      o.status !== 'PENDING' ||
      !payment ||
      payment.status !== 'PENDING' ||
      !SLIP_PAYMENT_METHODS.includes(payment.method)
    ) {
      throw new BadRequestException({ code: 'NOT_PAYABLE', message: 'This order has nothing to pay' });
    }
    const slipKey = await this.store(customerId, file);
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { slipKey, slipUploadedAt: new Date() },
    });
    if (payment.slipKey) await this.storage.remove(payment.slipKey);
    return { ok: true };
  }

  async slip(customerId: string, number: string) {
    const payment = paymentOf(await this.owned(customerId, number));
    if (!payment?.slipKey) throw new NotFoundException('No slip uploaded');
    return this.storage.get(payment.slipKey);
  }

  private async owned(customerId: string, number: string): Promise<ShopOrderWithPayments> {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      include: withPayments,
    });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  private async store(customerId: string, file: Express.Multer.File | undefined): Promise<string> {
    if (!file) throw new BadRequestException({ code: 'SLIP_REQUIRED', message: 'No file uploaded' });
    if (file.size > CUSTOMER_LIMITS.qrMaxBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 2 MB or smaller' });
    }
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Upload a PNG, JPG or WebP image' });
    const key = `${slipPrefix(customerId)}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    return key;
  }
}
