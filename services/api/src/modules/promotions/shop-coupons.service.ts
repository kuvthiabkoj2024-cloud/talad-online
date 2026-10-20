import { randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { COUPON_RULES } from '@talad/shared';
import { Prisma, type Coupon } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CouponBatchDto, CouponRulesDto, ShopCouponDto } from './shop-coupon.dto.js';

/** No 0/O or 1/I, so printed codes can be typed back without mistakes. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (prefix: string) =>
  prefix + Array.from({ length: COUPON_RULES.randomLength }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
/** A start a few minutes back still counts as "now" (the form fills in the current time). */
const START_GRACE_MS = 10 * 60_000;

/** Where a coupon is in its life, for the list badges. */
export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'INACTIVE';

export interface ShopCoupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perCustomer: number | null;
  usedCount: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  state: CouponState;
  /** Set on codes generated together. */
  batchId: string | null;
  createdAt: Date;
}

export function couponState(c: Pick<Coupon, 'isActive' | 'startsAt' | 'endsAt' | 'usedCount' | 'usageLimit'>, now = new Date()): CouponState {
  if (!c.isActive) return 'INACTIVE';
  if (c.endsAt <= now) return 'EXPIRED';
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'USED_UP';
  if (c.startsAt > now) return 'SCHEDULED';
  return 'ACTIVE';
}

/** A shop's own coupon codes (§3.4). Checkout applies them (orders/checkout-pricing.ts). */
@Injectable()
export class ShopCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `shopId` null = platform-wide coupons (admin console). */
  async list(shopId: string | null): Promise<ShopCoupon[]> {
    const rows = await this.prisma.coupon.findMany({ where: { shopId }, orderBy: [{ createdAt: 'desc' }] });
    return rows.map((c) => this.toView(c));
  }

  async create(shopId: string | null, dto: ShopCouponDto): Promise<ShopCoupon> {
    this.assertDates(dto, null);
    await this.assertCodeFree(shopId, dto.code, null);
    try {
      return this.toView(await this.prisma.coupon.create({ data: { shopId, ...this.fields(dto) } }));
    } catch (e) {
      throw this.conflict(e);
    }
  }

  /**
   * `quantity` distinct codes with the same rules, each usable `usesPerCode` times — for
   * handing one code to each customer (printed vouchers, a giveaway list).
   */
  async createBatch(shopId: string, dto: CouponBatchDto): Promise<ShopCoupon[]> {
    this.assertDates(dto, null);
    const rules = this.rules(dto);
    const prefix = dto.prefix ?? '';
    const batchId = randomUUID();
    const codes = new Set<string>();
    // Random codes rarely clash; draw again for any the shop already has.
    for (let round = 0; codes.size < dto.quantity; round++) {
      if (round === 10) throw new ConflictException({ code: 'CODE_TAKEN', message: 'Could not find enough free codes; try another prefix' });
      const fresh = new Set<string>();
      while (fresh.size < dto.quantity - codes.size) {
        const code = randomCode(prefix);
        if (!codes.has(code)) fresh.add(code);
      }
      const taken = await this.prisma.coupon.findMany({ where: { shopId, code: { in: [...fresh] } }, select: { code: true } });
      const clash = new Set(taken.map((c) => c.code));
      for (const code of fresh) if (!clash.has(code)) codes.add(code);
    }
    try {
      await this.prisma.coupon.createMany({
        data: [...codes].map((code) => ({ shopId, code, batchId, usageLimit: dto.usesPerCode, ...rules })),
      });
    } catch (e) {
      throw this.conflict(e);
    }
    const rows = await this.prisma.coupon.findMany({ where: { shopId, batchId }, orderBy: { code: 'asc' } });
    return rows.map((c) => this.toView(c));
  }

  /** Turns every code of a batch on or off. */
  async setBatchActive(shopId: string, batchId: string, isActive: boolean): Promise<{ count: number }> {
    const { count } = await this.prisma.coupon.updateMany({ where: { shopId, batchId }, data: { isActive } });
    if (count === 0) throw new NotFoundException('Coupon batch not found');
    return { count };
  }

  /** Deletes a batch's unused codes; used ones stay (orders refer to them) but are turned off. */
  async removeBatch(shopId: string, batchId: string): Promise<{ deleted: number; kept: number }> {
    return this.prisma.$transaction(async (tx) => {
      const { count: deleted } = await tx.coupon.deleteMany({ where: { shopId, batchId, usedCount: 0 } });
      const { count: kept } = await tx.coupon.updateMany({ where: { shopId, batchId }, data: { isActive: false } });
      if (deleted + kept === 0) throw new NotFoundException('Coupon batch not found');
      return { deleted, kept };
    });
  }

  async update(shopId: string | null, id: string, dto: ShopCouponDto): Promise<ShopCoupon> {
    const current = await this.owned(shopId, id);
    this.assertDates(dto, current);
    if (current.usedCount > 0) {
      // Customers have used it: what they were told it gives can't change under them.
      if (dto.code !== current.code || dto.type !== current.type || dto.value !== current.value.toNumber()) {
        throw new ConflictException({ code: 'COUPON_LOCKED', message: 'A used coupon’s code and discount can’t be changed' });
      }
      if (dto.usageLimit != null && dto.usageLimit < current.usedCount) {
        throw new BadRequestException({ code: 'LIMIT_BELOW_USED', message: 'The limit is below the uses so far', used: current.usedCount });
      }
    }
    await this.assertCodeFree(shopId, dto.code, id);
    try {
      return this.toView(await this.prisma.coupon.update({ where: { id }, data: this.fields(dto) }));
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async setActive(shopId: string | null, id: string, isActive: boolean): Promise<ShopCoupon> {
    await this.owned(shopId, id);
    return this.toView(await this.prisma.coupon.update({ where: { id }, data: { isActive } }));
  }

  async remove(shopId: string | null, id: string): Promise<void> {
    const coupon = await this.owned(shopId, id);
    if (coupon.usedCount > 0) {
      throw new ConflictException({
        code: 'COUPON_USED',
        message: 'A coupon that has been used can’t be deleted; turn it off instead',
      });
    }
    await this.prisma.coupon.delete({ where: { id } });
  }

  private fields(dto: ShopCouponDto) {
    return { code: dto.code, usageLimit: dto.usageLimit ?? null, ...this.rules(dto) };
  }

  private rules(dto: CouponRulesDto) {
    const percent = dto.type === 'PERCENTAGE';
    if (percent && dto.value > COUPON_RULES.maxPercent) {
      throw new BadRequestException({ code: 'INVALID_PERCENT', message: `At most ${COUPON_RULES.maxPercent}% off` });
    }
    // A fixed discount bigger than the minimum spend would make orders free.
    if (!percent && dto.minOrderAmount && dto.value > dto.minOrderAmount) {
      throw new BadRequestException({ code: 'VALUE_ABOVE_MIN', message: 'The discount is more than the minimum order' });
    }
    return {
      type: dto.type,
      value: dto.value,
      minOrderAmount: dto.minOrderAmount ?? null,
      // A cap only means something for percentages.
      maxDiscount: percent ? (dto.maxDiscount ?? null) : null,
      perCustomer: dto.perCustomer ?? null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      isActive: dto.isActive,
    };
  }

  /**
   * The end must follow the start and lie ahead; a new start can't be in the past (an
   * existing coupon keeps the start it already had).
   */
  private assertDates(dto: CouponRulesDto, current: Coupon | null) {
    const now = Date.now();
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'The end must be after the start' });
    }
    if (dto.endsAt.getTime() <= now) {
      throw new BadRequestException({ code: 'END_IN_PAST', message: 'The end must be in the future' });
    }
    const startChanged = !current || current.startsAt.getTime() !== dto.startsAt.getTime();
    if (startChanged && dto.startsAt.getTime() < now - START_GRACE_MS) {
      throw new BadRequestException({ code: 'START_IN_PAST', message: 'The start can’t be in the past' });
    }
  }

  /** The DB unique index ignores NULL shop ids, so platform codes are checked here. */
  private async assertCodeFree(shopId: string | null, code: string, exceptId: string | null) {
    const clash = await this.prisma.coupon.findFirst({ where: { shopId, code, ...(exceptId && { NOT: { id: exceptId } }) }, select: { id: true } });
    if (clash) throw new ConflictException({ code: 'CODE_TAKEN', message: 'This code is already used' });
  }

  private async owned(shopId: string | null, id: string): Promise<Coupon> {
    const coupon = await this.prisma.coupon.findFirst({ where: { id, shopId } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  private toView(c: Coupon): ShopCoupon {
    return {
      id: c.id,
      code: c.code,
      type: c.type,
      value: c.value.toNumber(),
      minOrderAmount: c.minOrderAmount?.toNumber() ?? null,
      maxDiscount: c.maxDiscount?.toNumber() ?? null,
      usageLimit: c.usageLimit,
      perCustomer: c.perCustomer,
      usedCount: c.usedCount,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      isActive: c.isActive,
      state: couponState(c),
      batchId: c.batchId,
      createdAt: c.createdAt,
    };
  }

  private conflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException({ code: 'CODE_TAKEN', message: 'Your shop already has this code' });
    }
    return e;
  }
}
