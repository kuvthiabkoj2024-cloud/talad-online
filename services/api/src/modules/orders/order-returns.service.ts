import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NOT_COLLECTED_REASON, RETURN_RULES, returnOpen } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { Prisma, Shop } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import { discardTempFile } from '../media/temp-file-storage.js';
import { detectVideo } from '../media/video-type.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CustomerReturnDto, ShopReturnDto } from './order-returns.dto.js';
import { moveOrder } from './order-transitions.js';

const VIDEO_KEY = /\.(mp4|mov|webm)$/;

export const evidenceKind = (key: string): 'IMAGE' | 'VIDEO' => (VIDEO_KEY.test(key) ? 'VIDEO' : 'IMAGE');

const evidencePrefix = (folder: string) => filePrefix(folder, 'evidence');

const select = {
  id: true,
  number: true,
  status: true,
  shopId: true,
  payoutId: true,
  pickup: true,
  shop: { select: { name: true } },
  order: { select: { customerId: true } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { method: true } },
  disputes: { take: 1, select: { id: true } },
  history: { where: { toStatus: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
  items: { take: 1, select: { product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } } } },
} satisfies Prisma.ShopOrderSelect;

type Row = Prisma.ShopOrderGetPayload<{ select: typeof select }>;

/**
 * Returns (Terms §13–16). The customer, or the shop for a cash-on-delivery order nobody took,
 * sends the reason and photos or a clip directly to MC Mart as a dispute; the order waits in
 * RETURN_REQUESTED until an admin decides (AdminOrdersService.decideDispute). Only an approved
 * return drops the commission: a shop can't cancel a COD sale it collected by reporting it.
 */
@Injectable()
export class OrderReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Evidence ──────────────────────────────────────────────────────────────

  async uploadForCustomer(customerId: string, number: string, file: Express.Multer.File | undefined) {
    try {
      const row = await this.prisma.shopOrder.findFirst({ where: { number, order: { customerId } }, select });
      if (!row) throw new NotFoundException('Order not found');
      this.assertOpen(row);
      return await this.store(evidencePrefix(storageFolder.customerReturns(customerId)), file);
    } finally {
      await discardTempFile(file?.path);
    }
  }

  async uploadForShop(shop: Shop, number: string, file: Express.Multer.File | undefined) {
    try {
      const row = await this.prisma.shopOrder.findFirst({ where: { number, shopId: shop.id }, select });
      if (!row) throw new NotFoundException('Order not found');
      this.assertShopCanReport(row);
      return await this.store(evidencePrefix(storageFolder.shopReturns(shop.id)), file);
    } finally {
      await discardTempFile(file?.path);
    }
  }

  /** Stored privately under `prefix`; the type comes from the bytes, not what the browser claimed. */
  private async store(prefix: string, file: Express.Multer.File | undefined): Promise<{ key: string }> {
    if (!file) throw new BadRequestException({ code: 'INVALID_FILE', message: 'No file uploaded' });
    const head = Buffer.alloc(16);
    const handle = await open(file.path);
    await handle.read(head, 0, head.length, 0).finally(() => handle.close());
    const image = detectImage(head);
    const type = image ?? detectVideo(head);
    if (!type) throw new BadRequestException({ code: 'INVALID_FILE', message: 'Upload a photo or a video clip' });
    if (file.size > (image ? RETURN_RULES.imageMaxBytes : RETURN_RULES.videoMaxBytes)) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File is too large' });
    }
    const key = `${prefix}${randomUUID()}.${type.ext}`;
    await this.storage.putFile(key, file.path, type.type);
    return { key };
  }

  /** At least one file, only the sender's own, within the limits. */
  private checkEvidence(keys: string[], prefix: string) {
    const unique = [...new Set(keys)];
    if (!unique.length) throw new BadRequestException({ code: 'EVIDENCE_REQUIRED', message: 'Add a photo or a video clip' });
    if (unique.length > RETURN_RULES.maxFiles || unique.filter((k) => evidenceKind(k) === 'VIDEO').length > RETURN_RULES.maxVideos) {
      throw new BadRequestException({ code: 'TOO_MANY_FILES', message: 'Too many files' });
    }
    if (unique.some((k) => !k.startsWith(prefix))) throw new BadRequestException({ code: 'INVALID_FILE', message: 'Unknown file' });
    return unique;
  }

  // ─── Who can ask ───────────────────────────────────────────────────────────

  private assertOpen(row: Row) {
    if (row.disputes.length) throw new ConflictException({ code: 'RETURN_ALREADY_REQUESTED', message: 'A return was already requested for this order' });
    // A completed order already in a payout (from before payouts waited out the window) goes through support.
    if (row.payoutId || !returnOpen(row.status, row.history[0]?.createdAt)) {
      throw new ConflictException({ code: 'RETURN_NOT_ALLOWED', message: 'This order can no longer be returned' });
    }
  }

  private assertShopCanReport(row: Row) {
    if (row.payments[0]?.method !== 'COD') throw new ConflictException({ code: 'RETURN_NOT_ALLOWED', message: 'Only cash-on-delivery orders can be reported' });
    this.assertOpen(row);
  }

  // ─── Requests ──────────────────────────────────────────────────────────────

  async requestByCustomer(customerId: string, number: string, dto: CustomerReturnDto) {
    const row = await this.prisma.shopOrder.findFirst({ where: { number, order: { customerId } }, select });
    if (!row) throw new NotFoundException('Order not found');
    this.assertOpen(row);
    const evidenceKeys = this.checkEvidence(dto.evidenceKeys, evidencePrefix(storageFolder.customerReturns(customerId)));
    const details = dto.details?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await this.open(tx, row, { raisedBy: 'CUSTOMER', actorId: customerId, reason: dto.reason, details, evidenceKeys });
      await this.notifications.notifyOrder(tx, this.target(row), 'RETURN_REQUESTED');
      await this.notifications.toShop(
        tx,
        row.shopId,
        'ORDER',
        {
          lo: { title: `ລູກຄ້າຂໍຄືນສິນຄ້າ ${row.number}`, body: 'MC Mart ກຳລັງກວດສອບ ແລະ ຈະແຈ້ງຜົນໃຫ້ທ່ານຮູ້.' },
          en: { title: `Return requested ${row.number}`, body: 'MC Mart is reviewing it and will let you know the outcome.' },
        },
        { link: `/orders/${row.number}` },
      );
      await this.notifications.toAdmins(
        tx,
        'RETURN',
        {
          lo: { title: `ລູກຄ້າຂໍຄືນສິນຄ້າ ${row.number}`, body: `${row.shop.name} · ຫຼັກຖານ ${evidenceKeys.length} ໄຟລ໌` },
          en: { title: `Return request ${row.number}`, body: `${row.shop.name} · ${evidenceKeys.length} file(s) attached` },
        },
        { link: '/disputes' },
      );
    });
    return { status: 'RETURN_REQUESTED' as const };
  }

  /** The customer never took a COD order: reported with proof, it counts for no commission once approved. */
  async requestByShop(shop: Shop, number: string, dto: ShopReturnDto) {
    const row = await this.prisma.shopOrder.findFirst({ where: { number, shopId: shop.id }, select });
    if (!row) throw new NotFoundException('Order not found');
    this.assertShopCanReport(row);
    const evidenceKeys = this.checkEvidence(dto.evidenceKeys, evidencePrefix(storageFolder.shopReturns(shop.id)));
    const details = dto.details?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await this.open(tx, row, { raisedBy: 'SHOP', actorId: shop.id, reason: NOT_COLLECTED_REASON, details, evidenceKeys });
      await this.notifications.send(
        tx,
        row.order.customerId,
        'ORDER',
        {
          lo: { title: `ຮ້ານແຈ້ງວ່າບໍ່ໄດ້ຮັບສິນຄ້າ ${row.number}`, body: `${row.shop.name} ແຈ້ງວ່າທ່ານບໍ່ໄດ້ຮັບສິນຄ້ານີ້. MC Mart ກຳລັງກວດສອບ.` },
          en: { title: `Shop reported ${row.number} not collected`, body: `${row.shop.name} says you did not take this order. MC Mart is reviewing it.` },
        },
        { link: `/account/orders/${row.number}` },
      );
      await this.notifications.toAdmins(
        tx,
        'RETURN',
        {
          lo: { title: `ຮ້ານແຈ້ງຄືນ COD ${row.number}`, body: `${row.shop.name}: ລູກຄ້າບໍ່ໄດ້ຮັບສິນຄ້າ · ຫຼັກຖານ ${evidenceKeys.length} ໄຟລ໌` },
          en: { title: `COD return from shop ${row.number}`, body: `${row.shop.name}: not collected · ${evidenceKeys.length} file(s) attached` },
        },
        { link: '/disputes' },
      );
    });
    return { status: 'RETURN_REQUESTED' as const };
  }

  private async open(
    tx: Prisma.TransactionClient,
    row: Row,
    input: { raisedBy: 'CUSTOMER' | 'SHOP'; actorId: string; reason: string; details: string | null; evidenceKeys: string[] },
  ) {
    const moved = await moveOrder(tx, row.id, row.status, 'RETURN_REQUESTED', {}, { actorType: input.raisedBy, actorId: input.actorId, note: input.details });
    if (!moved) throw new ConflictException({ code: 'RETURN_NOT_ALLOWED', message: 'This order was just updated' });
    await tx.dispute.create({
      data: { shopOrderId: row.id, raisedBy: input.raisedBy, reason: input.reason, details: input.details, evidenceKeys: input.evidenceKeys },
    });
  }

  private target(row: Row) {
    return { customerId: row.order.customerId, number: row.number, shopName: row.shop.name, imageKey: row.items[0]?.product.images[0]?.key, pickup: row.pickup };
  }
}
