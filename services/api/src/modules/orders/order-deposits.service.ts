import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DEPOSIT_NOTES, DEPOSIT_RULES, formatMoney } from '@talad/shared';
import type { Prisma, Shop } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PaymentSlipsService } from './payment-slips.service.js';

const select = {
  id: true,
  number: true,
  status: true,
  shopId: true,
  depositAmount: true,
  depositStatus: true,
  depositSlipKey: true,
  shop: { select: { name: true } },
  order: { select: { customerId: true } },
} satisfies Prisma.ShopOrderSelect;

type Row = Prisma.ShopOrderGetPayload<{ select: typeof select }>;

const dueAt = () => new Date(Date.now() + DEPOSIT_RULES.reviewHours * 3_600_000);

/**
 * An order that fell through settles its deposit. `KEPT`: the customer didn't collect it, so the
 * shop keeps what it confirmed. Otherwise the shop owes it back; it pays directly and MC Mart
 * only records that. A rejected slip means nothing was received, so there is nothing to settle.
 */
export async function settleDeposit(tx: Prisma.TransactionClient, notifications: NotificationsService, shopOrderId: string, outcome: 'RETURN_DUE' | 'KEPT') {
  const { count } = await tx.shopOrder.updateMany({
    where: { id: shopOrderId, depositStatus: outcome === 'KEPT' ? 'CONFIRMED' : { in: ['PENDING', 'CONFIRMED'] } },
    data: { depositStatus: outcome, depositDueAt: null },
  });
  if (!count) return;
  const so = await tx.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId }, select });
  const money = { lo: formatMoney(so.depositAmount.toNumber(), 'lo'), en: formatMoney(so.depositAmount.toNumber(), 'en') };
  if (outcome === 'KEPT') {
    await notifications.send(
      tx,
      so.order.customerId,
      'ORDER',
      {
        lo: { title: `ຮ້ານເກັບເງິນມັດຈຳ ${so.number}`, body: `ຄຳສັ່ງຊື້ຖືກຍົກເລີກ ເພາະບໍ່ໄດ້ຮັບສິນຄ້າ, ${so.shop.name} ຈຶ່ງເກັບເງິນມັດຈຳ ${money.lo}.` },
        en: { title: `Deposit kept for ${so.number}`, body: `The order was cancelled as it wasn't collected, so ${so.shop.name} keeps the ${money.en} deposit.` },
      },
      { link: `/account/orders/${so.number}` },
    );
    return;
  }
  await notifications.send(
    tx,
    so.order.customerId,
    'ORDER',
    {
      lo: { title: `ຮ້ານຕ້ອງຄືນເງິນມັດຈຳ ${so.number}`, body: `${so.shop.name} ຕ້ອງຄືນເງິນມັດຈຳ ${money.lo} ໃຫ້ທ່ານໂດຍກົງ.` },
      en: { title: `Deposit to be returned for ${so.number}`, body: `${so.shop.name} must return your ${money.en} deposit directly to you.` },
    },
    { link: `/account/orders/${so.number}` },
  );
  await notifications.toShop(
    tx,
    so.shopId,
    'ORDER',
    {
      lo: { title: `ຕ້ອງຄືນເງິນມັດຈຳ ${so.number}`, body: `ຄືນເງິນມັດຈຳ ${money.lo} ໃຫ້ລູກຄ້າ ແລ້ວກົດບັນທຶກຢູ່ຄຳສັ່ງຊື້.` },
      en: { title: `Return the deposit for ${so.number}`, body: `Send the ${money.en} deposit back to the customer, then record it on the order.` },
    },
    { link: `/orders/${so.number}` },
  );
}

/** Deposits with cash on delivery: paid to the shop's own account, so the shop checks them. */
@Injectable()
export class OrderDepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly slips: PaymentSlipsService,
  ) {}

  private async forShop(shop: Shop, number: string): Promise<Row> {
    const row = await this.prisma.shopOrder.findFirst({ where: { number, shopId: shop.id }, select });
    if (!row?.depositStatus) throw new NotFoundException('No deposit on this order');
    return row;
  }

  private async forCustomer(customerId: string, number: string): Promise<Row> {
    const row = await this.prisma.shopOrder.findFirst({ where: { number, order: { customerId } }, select });
    if (!row?.depositStatus) throw new NotFoundException('No deposit on this order');
    return row;
  }

  /** Moves the deposit only from the status it was read in, and records the step. */
  private async move(
    tx: Prisma.TransactionClient,
    row: Row,
    from: 'PENDING' | 'REJECTED' | 'RETURN_DUE',
    data: Prisma.ShopOrderUpdateManyMutationInput,
    history: { actorType: 'SHOP' | 'CUSTOMER'; actorId: string; note: string },
  ) {
    const { count } = await tx.shopOrder.updateMany({ where: { id: row.id, depositStatus: from, status: row.status }, data });
    if (!count) throw new ConflictException({ code: 'DEPOSIT_CHANGED', message: 'This deposit was just updated' });
    await tx.orderStatusHistory.create({ data: { shopOrderId: row.id, fromStatus: row.status, toStatus: row.status, ...history } });
  }

  async confirm(shop: Shop, number: string) {
    const row = await this.forShop(shop, number);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, row, 'PENDING', { depositStatus: 'CONFIRMED', depositDueAt: null, depositRejectReason: null }, { actorType: 'SHOP', actorId: shop.id, note: DEPOSIT_NOTES.confirmed });
      await this.notifications.send(
        tx,
        row.order.customerId,
        'ORDER',
        {
          lo: { title: `ຮ້ານຢືນຢັນມັດຈຳແລ້ວ ${row.number}`, body: `${shop.name} ໄດ້ຮັບເງິນມັດຈຳແລ້ວ ແລະ ກຳລັງກະກຽມສິນຄ້າ.` },
          en: { title: `Deposit confirmed for ${row.number}`, body: `${shop.name} received your deposit and is preparing the order.` },
        },
        { link: `/account/orders/${row.number}` },
      );
    });
  }

  async reject(shop: Shop, number: string, reason: string) {
    const row = await this.forShop(shop, number);
    const why = reason.trim();
    if (!why) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Tell the customer why' });
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, row, 'PENDING', { depositStatus: 'REJECTED', depositDueAt: dueAt(), depositRejectReason: why }, { actorType: 'SHOP', actorId: shop.id, note: DEPOSIT_NOTES.rejected });
      await this.notifications.send(
        tx,
        row.order.customerId,
        'ORDER',
        {
          lo: { title: `ຮ້ານບໍ່ຮັບສະລິບມັດຈຳ ${row.number}`, body: `${why} · ສົ່ງສະລິບໃໝ່ພາຍໃນ ${DEPOSIT_RULES.reviewHours} ຊົ່ວໂມງ ບໍ່ດັ່ງນັ້ນຄຳສັ່ງຊື້ຈະຖືກຍົກເລີກ.` },
          en: { title: `Deposit slip rejected for ${row.number}`, body: `${why} · Send a new slip within ${DEPOSIT_RULES.reviewHours} hours or the order is cancelled.` },
        },
        { link: `/account/orders/${row.number}` },
      );
    });
  }

  /** A new slip after the shop rejected one: the shop gets its full time to check again. */
  async resubmit(customerId: string, number: string, file: Express.Multer.File | undefined) {
    const row = await this.forCustomer(customerId, number);
    if (row.depositStatus !== 'REJECTED') throw new ConflictException({ code: 'DEPOSIT_CHANGED', message: 'This deposit is not waiting for a new slip' });
    const { slipKey } = await this.slips.uploadCheckoutSlip(customerId, file);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, row, 'REJECTED', { depositStatus: 'PENDING', depositSlipKey: slipKey, depositDueAt: dueAt(), depositRejectReason: null }, { actorType: 'CUSTOMER', actorId: customerId, note: DEPOSIT_NOTES.submitted });
      await this.notifications.toShop(
        tx,
        row.shopId,
        'ORDER',
        {
          lo: { title: `ສະລິບມັດຈຳໃໝ່ ${row.number}`, body: 'ລູກຄ້າສົ່ງສະລິບໃໝ່. ກະລຸນາກວດບັນຊີຂອງທ່ານ ແລະ ຢືນຢັນ.' },
          en: { title: `New deposit slip for ${row.number}`, body: 'The customer sent a new slip. Please check your account and confirm it.' },
        },
        { link: `/orders/${row.number}` },
      );
    });
    if (row.depositSlipKey) await this.storage.remove(row.depositSlipKey);
  }

  /** The shop sent the money back; MC Mart only records it. */
  async markReturned(shop: Shop, number: string) {
    const row = await this.forShop(shop, number);
    await this.prisma.$transaction(async (tx) => {
      await this.move(tx, row, 'RETURN_DUE', { depositStatus: 'RETURNED' }, { actorType: 'SHOP', actorId: shop.id, note: DEPOSIT_NOTES.returned });
      await this.notifications.send(
        tx,
        row.order.customerId,
        'ORDER',
        {
          lo: { title: `ຮ້ານຄືນເງິນມັດຈຳແລ້ວ ${row.number}`, body: `${shop.name} ແຈ້ງວ່າຄືນເງິນມັດຈຳໃຫ້ທ່ານແລ້ວ. ຖ້າຍັງບໍ່ໄດ້ຮັບ ກະລຸນາຕິດຕໍ່ຮ້ານ ຫຼື MC Mart.` },
          en: { title: `Deposit returned for ${row.number}`, body: `${shop.name} says it returned your deposit. If you didn't get it, contact the shop or MC Mart.` },
        },
        { link: `/account/orders/${row.number}` },
      );
    });
  }

  async slipForShop(shop: Shop, number: string) {
    return this.slipOf(await this.forShop(shop, number));
  }

  async slipForCustomer(customerId: string, number: string) {
    return this.slipOf(await this.forCustomer(customerId, number));
  }

  private slipOf(row: Row) {
    if (!row.depositSlipKey) throw new NotFoundException('No deposit slip');
    return this.storage.get(row.depositSlipKey);
  }

  /** The QR a customer pays a shop's deposit to; only a shop taking cash on delivery shows it. */
  async shopQr(shopId: string) {
    const shop = await this.prisma.shop.findFirst({ where: { id: shopId, codEnabled: true, status: 'APPROVED' }, select: { paymentQrKey: true } });
    if (!shop?.paymentQrKey) throw new NotFoundException('No payment QR');
    return this.storage.get(shop.paymentQrKey);
  }
}
