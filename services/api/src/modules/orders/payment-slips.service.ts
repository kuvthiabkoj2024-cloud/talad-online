import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CUSTOMER_LIMITS, MAX_PAYMENT_SLIPS, SLIP_PAYMENT_METHODS, formatMoney } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.validation.js';
import type { Payment, Prisma, SlipStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../auth/email.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PlatformAccountService } from './platform-account.service.js';

/** Storage prefix for a customer's uploaded transfer slips. */
export const slipPrefix = (customerId: string) => filePrefix(storageFolder.customerPayments(customerId), 'slip');

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

/** One slip as the customer sees it. */
export interface SlipView {
  id: string;
  status: SlipStatus;
  rejectReason: string | null;
  createdAt: Date;
}

/** Where a transfer stands: being checked, rejected (send new slips) or approved. */
export type PaymentCheck = 'reviewing' | 'rejected' | 'approved' | null;

/** The latest round of slips decides it: any waiting → reviewing; else the newest one's verdict. */
export function paymentCheck(slips: { status: SlipStatus }[]): PaymentCheck {
  if (!slips.length) return null;
  if (slips.some((s) => s.status === 'PENDING')) return 'reviewing';
  return slips[0].status === 'APPROVED' ? 'approved' : 'rejected';
}

/** Tells the admins a payment is waiting for them (they check it against Taladonline's account). */
export async function tellAdminsToCheck(
  notifications: NotificationsService,
  db: Prisma.TransactionClient,
  order: { number: string; total: number; again?: boolean },
): Promise<void> {
  const short = order.number.replace(/^O/, '');
  await notifications.toAdmins(
    db,
    'PAYMENT',
    {
      lo: { title: `${order.again ? 'ສະລິບໃໝ່' : 'ມີການໂອນໃໝ່'} ${short}`, body: `${formatMoney(order.total, 'lo')} · ກວດການໂອນ ແລະ ອະນຸມັດ.` },
      en: { title: `${order.again ? 'New slips for' : 'New transfer'} ${short}`, body: `${formatMoney(order.total, 'en')} · Check the transfer and approve it.` },
    },
    { link: `/payments/${order.number}` },
  );
}

/**
 * Manual transfers (§6): customers pay Taladonline's QR/account and upload up to
 * MAX_PAYMENT_SLIPS slips per round; an admin checks them (PaymentReviewService).
 */
@Injectable()
export class PaymentSlipsService {
  private readonly logger = new Logger(PaymentSlipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly account: PlatformAccountService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Emails ADMIN_ORDER_EMAIL that a transfer is waiting to be checked (a new order, or new
   * slips after a rejection). Call it once the order is saved; it never throws.
   */
  async emailAdmins(orderNumber: string, again = false): Promise<void> {
    const to = this.config.get('ADMIN_ORDER_EMAIL', { infer: true });
    if (!to) return;
    try {
      const o = await this.prisma.order.findUnique({
        where: { number: orderNumber },
        select: {
          number: true,
          grandTotal: true,
          createdAt: true,
          customer: { select: { name: true, phone: true } },
          shopOrders: { select: { number: true, total: true, shop: { select: { name: true } } } },
          slips: { where: { status: 'PENDING' }, select: { id: true } },
        },
      });
      if (!o) return;
      const link = `${this.config.get('ADMIN_APP_URL', { infer: true }).replace(/\/$/, '')}/payments/${o.number}`;
      const total = formatMoney(o.grandTotal.toNumber(), 'en');
      const subject = `${again ? 'New slips' : 'New transfer order'} ${o.number} · ${total}`;
      const text = [
        again ? 'The customer sent new payment slips. Check the transfer and approve it.' : 'A customer paid by transfer. Check it against Taladonline’s account and approve it — the shop gets the order only after that.',
        '',
        `Order: ${o.number}`,
        `Amount to receive: ${total}`,
        `Customer: ${o.customer.name}${o.customer.phone ? ` (${o.customer.phone})` : ''}`,
        `Slips: ${o.slips.length}`,
        ...o.shopOrders.map((s) => `Shop: ${s.shop.name} — ${s.number} · ${formatMoney(s.total.toNumber(), 'en')}`),
        '',
        `Check and approve: ${link}`,
      ].join('\n');
      await Promise.all(to.split(',').map((addr) => addr.trim()).filter(Boolean).map((addr) => this.email.send(addr, subject, text)));
    } catch (e) {
      this.logger.warn(`Order email for ${orderNumber} not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Checkout: slip uploaded before the order exists. Returns the key to send with the order. */
  async uploadCheckoutSlip(customerId: string, file: Express.Multer.File | undefined) {
    return { slipKey: await this.store(customerId, file) };
  }

  /** Taladonline's receiving QR, shown to signed-in customers. */
  platformQr() {
    return this.account.qr();
  }

  /** The order's slips, newest first, with the check result. */
  async slips(customerId: string, number: string): Promise<SlipView[]> {
    const o = await this.owned(customerId, number);
    return o.order.slips.map((s) => ({ id: s.id, status: s.status, rejectReason: s.rejectReason, createdAt: s.createdAt }));
  }

  async slipImage(customerId: string, number: string, slipId: string) {
    const o = await this.owned(customerId, number);
    const slip = o.order.slips.find((s) => s.id === slipId);
    if (!slip) throw new NotFoundException('Slip not found');
    return this.storage.get(slip.key);
  }

  /**
   * New slips for an order still waiting for payment (first time, or after a rejection):
   * up to MAX_PAYMENT_SLIPS waiting at once. The admins are told to check them.
   */
  async attachSlips(customerId: string, number: string, files: Express.Multer.File[] | undefined) {
    const o = await this.owned(customerId, number);
    const payment = paymentOf(o);
    if (o.status !== 'PENDING' || !payment || payment.status !== 'PENDING' || !SLIP_PAYMENT_METHODS.includes(payment.method)) {
      throw new BadRequestException({ code: 'NOT_PAYABLE', message: 'This order has nothing to pay' });
    }
    if (!files?.length) throw new BadRequestException({ code: 'SLIP_REQUIRED', message: 'No file uploaded' });
    const waiting = o.order.slips.filter((s) => s.status === 'PENDING').length;
    if (waiting + files.length > MAX_PAYMENT_SLIPS) {
      throw new BadRequestException({ code: 'TOO_MANY_SLIPS', message: `At most ${MAX_PAYMENT_SLIPS} slips at a time` });
    }
    const keys: string[] = [];
    for (const f of files) keys.push(await this.store(customerId, f));
    const again = o.order.slips.length > 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSlip.createMany({ data: keys.map((key) => ({ orderId: o.orderId, key })) });
      await tellAdminsToCheck(this.notifications, tx, { number: o.order.number, total: o.order.grandTotal.toNumber(), again });
    });
    void this.emailAdmins(o.order.number, again);
    return { slips: await this.slips(customerId, number) };
  }

  private async owned(customerId: string, number: string) {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        order: {
          select: {
            number: true,
            grandTotal: true,
            shopOrders: { select: { id: true } },
            payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
            slips: { orderBy: { createdAt: 'desc' } },
          },
        },
      },
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
