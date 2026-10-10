import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FLASH_SALE_RULES } from '@talad/shared';
import type { FlashSale, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import type { FlashSaleDto } from './flash-sale.dto.js';
import { flashPrice } from './flash-sale-pricing.service.js';

export type FlashSaleState = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'INACTIVE';

export interface ShopFlashSale {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  state: FlashSaleState;
  items: {
    productId: string;
    name: string;
    imageUrl: string | null;
    status: string;
    discountPercent: number;
    price: number;
    salePrice: number;
  }[];
}

const DAY = 86_400_000;

export function flashSaleState(s: Pick<FlashSale, 'isActive' | 'startsAt' | 'endsAt'>, now = new Date()): FlashSaleState {
  if (s.endsAt <= now) return 'ENDED';
  if (!s.isActive) return 'INACTIVE';
  return s.startsAt > now ? 'SCHEDULED' : 'ACTIVE';
}

const include = {
  items: {
    orderBy: { discountPercent: 'desc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          status: true,
          price: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
        },
      },
    },
  },
} satisfies Prisma.FlashSaleInclude;

/** A shop's flash sales (§3.4). Prices apply through FlashSalePricingService. */
@Injectable()
export class ShopFlashSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(shopId: string): Promise<ShopFlashSale[]> {
    const rows = await this.prisma.flashSale.findMany({ where: { shopId }, include, orderBy: [{ startsAt: 'desc' }] });
    const now = new Date();
    // Running and upcoming first, then the past.
    return rows
      .map((r) => this.toView(r, now))
      .sort((a, b) => Number(a.state === 'ENDED') - Number(b.state === 'ENDED'));
  }

  async create(shopId: string, dto: FlashSaleDto): Promise<ShopFlashSale> {
    await this.validate(shopId, dto, null);
    const sale = await this.prisma.flashSale.create({
      data: { shopId, ...this.fields(dto), items: { create: dto.items } },
      include,
    });
    return this.toView(sale);
  }

  async update(shopId: string, id: string, dto: FlashSaleDto): Promise<ShopFlashSale> {
    const current = await this.owned(shopId, id);
    if (flashSaleState(current) === 'ENDED') {
      throw new ConflictException({ code: 'SALE_ENDED', message: 'This sale has ended' });
    }
    await this.validate(shopId, dto, id);
    const sale = await this.prisma.$transaction(async (tx) => {
      await tx.flashSaleItem.deleteMany({ where: { flashSaleId: id } });
      return tx.flashSale.update({
        where: { id },
        data: { ...this.fields(dto), items: { create: dto.items } },
        include,
      });
    });
    return this.toView(sale);
  }

  async setActive(shopId: string, id: string, isActive: boolean): Promise<ShopFlashSale> {
    await this.owned(shopId, id);
    return this.toView(await this.prisma.flashSale.update({ where: { id }, data: { isActive }, include }));
  }

  async remove(shopId: string, id: string): Promise<void> {
    await this.owned(shopId, id);
    // Orders keep the price they were charged; nothing else refers to a sale.
    await this.prisma.flashSale.delete({ where: { id } });
  }

  private fields(dto: FlashSaleDto) {
    return { name: dto.name, startsAt: dto.startsAt, endsAt: dto.endsAt, isActive: dto.isActive };
  }

  private async validate(shopId: string, dto: FlashSaleDto, saleId: string | null) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'The end must be after the start' });
    }
    if (dto.endsAt.getTime() - dto.startsAt.getTime() > FLASH_SALE_RULES.maxDays * DAY) {
      throw new BadRequestException({ code: 'TOO_LONG', message: `A flash sale lasts at most ${FLASH_SALE_RULES.maxDays} days` });
    }
    if (dto.endsAt <= new Date()) {
      throw new BadRequestException({ code: 'INVALID_DATES', message: 'The sale must end in the future' });
    }
    const ids = dto.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({ code: 'DUPLICATE_PRODUCT', message: 'Each product only once' });
    }
    const owned = await this.prisma.product.count({ where: { id: { in: ids }, shopId } });
    if (owned !== ids.length) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'Unknown product' });

    // One sale per product at a time, so a price is never ambiguous.
    const clash = await this.prisma.flashSaleItem.findMany({
      where: {
        productId: { in: ids },
        flashSale: {
          shopId,
          isActive: true,
          ...(saleId && { id: { not: saleId } }),
          startsAt: { lt: dto.endsAt },
          endsAt: { gt: dto.startsAt },
        },
      },
      select: { productId: true, flashSale: { select: { name: true } } },
    });
    if (dto.isActive && clash.length) {
      throw new ConflictException({
        code: 'PRODUCT_IN_OTHER_SALE',
        message: 'Some products are already in another sale at that time',
        productIds: [...new Set(clash.map((c) => c.productId))],
        sale: clash[0].flashSale.name,
      });
    }
  }

  private async owned(shopId: string, id: string): Promise<FlashSale> {
    const sale = await this.prisma.flashSale.findFirst({ where: { id, shopId } });
    if (!sale) throw new NotFoundException('Flash sale not found');
    return sale;
  }

  private toView(s: Prisma.FlashSaleGetPayload<{ include: typeof include }>, now = new Date()): ShopFlashSale {
    return {
      id: s.id,
      name: s.name,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      isActive: s.isActive,
      state: flashSaleState(s, now),
      items: s.items.map((i) => {
        const price = i.product.price.toNumber();
        return {
          productId: i.productId,
          name: i.product.name,
          imageUrl: i.product.images[0] ? this.media.publicUrl(i.product.images[0].key) : null,
          status: i.product.status,
          discountPercent: i.discountPercent,
          price,
          salePrice: flashPrice(price, i.discountPercent),
        };
      }),
    };
  }
}
