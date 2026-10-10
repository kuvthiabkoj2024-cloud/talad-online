import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { COUPON_RULES } from '@talad/shared';
import { Prisma, type Coupon } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ShopCouponDto } from './shop-coupon.dto.js';

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
    await this.assertCodeFree(shopId, dto.code, null);
    try {
      return this.toView(await this.prisma.coupon.create({ data: { shopId, ...this.fields(dto) } }));
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(shopId: string | null, id: string, dto: ShopCouponDto): Promise<ShopCoupon> {
    await this.owned(shopId, id);
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
    const percent = dto.type === 'PERCENTAGE';
    if (percent && dto.value > COUPON_RULES.maxPercent) {
      throw new BadRequestException({ code: 'INVALID_PERCENT', message: `At most ${COUPON_RULES.maxPercent}% off` });
    }
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'The end must be after the start' });
    }
    return {
      code: dto.code,
      type: dto.type,
      value: dto.value,
      minOrderAmount: dto.minOrderAmount ?? null,
      // A cap only means something for percentages.
      maxDiscount: percent ? (dto.maxDiscount ?? null) : null,
      usageLimit: dto.usageLimit ?? null,
      perCustomer: dto.perCustomer ?? null,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      isActive: dto.isActive,
    };
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
