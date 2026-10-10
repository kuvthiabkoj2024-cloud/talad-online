import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MEDIA_LIMITS, PRODUCT_STATUSES, slugify, type ProductStatus } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { Prisma, type Shop } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { detectImage } from '../../media/image-type.js';
import { MediaService } from '../../media/media.service.js';
import { filePrefix, storageFolder } from '../../media/storage-keys.js';
import { StorageService } from '../../media/storage.service.js';
import { discardTempFile } from '../../media/temp-file-storage.js';
import { detectVideo } from '../../media/video-type.js';
import { priceRange } from './products.service.js';
import type { ListShopProductsQuery, ShopProductDto } from './shop-product.dto.js';

export interface ShopProductRow {
  id: string;
  slug: string;
  name: string;
  sku: string;
  status: ProductStatus;
  rejectionReason: string | null;
  price: number;
  priceMax: number | null;
  /** Total across options when the product has variants. */
  stock: number;
  lowStock: boolean;
  imageUrl: string | null;
  hasVideo: boolean;
  videoUrl: string | null;
  variantCount: number;
  soldCount: number;
  updatedAt: Date;
}

export interface ShopProductList {
  items: ShopProductRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Per status, plus `all`, for the tabs. */
  counts: Record<ProductStatus | 'all', number>;
}

export interface ShopProductDetail {
  id: string;
  slug: string;
  status: ProductStatus;
  rejectionReason: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  unitId: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  images: { key: string; url: string }[];
  video: { key: string; url: string } | null;
  variantOption: string | null;
  variants: { id: string; value: string; sku: string; price: number | null; stock: number }[];
}


/** The Seller Center's view of a shop's own products: every status, plus editing (§3.3). */
@Injectable()
export class ShopProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
  ) {}

  async list(shopId: string, query: ListShopProductsQuery): Promise<ShopProductList> {
    const term = query.q?.trim();
    const where: Prisma.ProductWhereInput = {
      shopId,
      ...(query.status && { status: query.status }),
      ...(query.video && { videoKey: query.video === 'with' ? { not: null } : null }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          slug: true,
          name: true,
          sku: true,
          status: true,
          rejectionReason: true,
          price: true,
          stock: true,
          lowStockThreshold: true,
          videoKey: true,
          soldCount: true,
          updatedAt: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
          variants: { select: { price: true, stock: true } },
        },
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.groupBy({ by: ['status'], where: { shopId }, _count: { _all: true } }),
    ]);

    const counts = Object.fromEntries(PRODUCT_STATUSES.map((s) => [s, 0])) as ShopProductList['counts'];
    counts.all = 0;
    for (const g of byStatus) {
      counts[g.status] = g._count._all;
      counts.all += g._count._all;
    }

    const items = rows.map((p) => {
      const base = p.price.toNumber();
      const stock = p.variants.length ? p.variants.reduce((sum, v) => sum + v.stock, 0) : p.stock;
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        status: p.status,
        rejectionReason: p.rejectionReason,
        ...priceRange(
          base,
          p.variants.map((v) => v.price?.toNumber() ?? null),
        ),
        stock,
        lowStock: stock <= p.lowStockThreshold,
        imageUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null,
        hasVideo: p.videoKey !== null,
        videoUrl: p.videoKey ? this.media.publicUrl(p.videoKey) : null,
        variantCount: p.variants.length,
        soldCount: p.soldCount,
        updatedAt: p.updatedAt,
      };
    });
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      counts,
    };
  }

  async get(shopId: string, id: string): Promise<ShopProductDetail> {
    const p = await this.prisma.product.findFirst({
      where: { id, shopId },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sku: 'asc' } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');

    const attrs = p.variants.map((v) => v.attributes as Record<string, string>);
    // Variants made here vary by one option; older ones may have several — shown joined.
    const option = attrs.length ? Object.keys(attrs[0]).join(' / ') : null;
    return {
      id: p.id,
      slug: p.slug,
      status: p.status,
      rejectionReason: p.rejectionReason,
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      unitId: p.unitId,
      sku: p.sku,
      price: p.price.toNumber(),
      compareAtPrice: p.compareAtPrice?.toNumber() ?? null,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      images: p.images.map((i) => ({ key: i.key, url: this.media.publicUrl(i.key) })),
      video: p.videoKey ? { key: p.videoKey, url: this.media.publicUrl(p.videoKey) } : null,
      variantOption: option,
      variants: p.variants.map((v, i) => ({
        id: v.id,
        value: Object.values(attrs[i]).join(' / '),
        sku: v.sku,
        price: v.price?.toNumber() ?? null,
        stock: v.stock,
      })),
    };
  }

  async create(shop: Shop, dto: ShopProductDto): Promise<ShopProductDetail> {
    await this.validate(shop.id, dto, []);
    const status = await this.statusFor(dto.intent, 'DRAFT');
    try {
      const product = await this.prisma.product.create({
        data: {
          shopId: shop.id,
          slug: await this.uniqueSlug(shop.id, dto.name, dto.sku),
          ...this.fields(dto),
          status,
          publishedAt: status === 'PUBLISHED' ? new Date() : null,
          images: { create: dto.imageKeys.map((key, sortOrder) => ({ key, sortOrder })) },
          variants: { create: dto.variants.map((v) => this.variantData(dto, v)) },
        },
      });
      return this.get(shop.id, product.id);
    } catch (e) {
      throw this.conflict(e);
    }
  }

  async update(shop: Shop, id: string, dto: ShopProductDto): Promise<ShopProductDetail> {
    const current = await this.prisma.product.findFirst({
      where: { id, shopId: shop.id },
      include: { images: true, variants: { include: { _count: { select: { orderItems: true } } } } },
    });
    if (!current) throw new NotFoundException('Product not found');
    await this.validate(shop.id, dto, [...current.images.map((i) => i.key), ...(current.videoKey ? [current.videoKey] : [])]);

    const keep = new Set(dto.variants.flatMap((v) => (v.id ? [v.id] : [])));
    if ([...keep].some((vid) => !current.variants.some((v) => v.id === vid))) {
      throw new BadRequestException({ code: 'INVALID_VARIANT', message: 'Unknown option' });
    }
    const removed = current.variants.filter((v) => !keep.has(v.id));
    if (removed.some((v) => v._count.orderItems > 0)) {
      throw new ConflictException({
        code: 'VARIANT_HAS_ORDERS',
        message: 'An option that has been ordered can’t be removed; set its stock to 0 instead',
      });
    }

    const status = await this.statusFor(dto.intent, current.status);
    try {
      await this.prisma.$transaction([
        this.prisma.productVariant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } }),
        this.prisma.productImage.deleteMany({ where: { productId: id } }),
        this.prisma.product.update({
          where: { id },
          data: {
            ...this.fields(dto),
            status,
            ...(status !== current.status && status !== 'REJECTED' && { rejectionReason: null }),
            ...(status === 'PUBLISHED' && !current.publishedAt && { publishedAt: new Date() }),
            images: { create: dto.imageKeys.map((key, sortOrder) => ({ key, sortOrder })) },
          },
        }),
        ...dto.variants.map((v) =>
          v.id
            ? this.prisma.productVariant.update({ where: { id: v.id }, data: this.variantData(dto, v) })
            : this.prisma.productVariant.create({ data: { productId: id, ...this.variantData(dto, v) } }),
        ),
      ]);
    } catch (e) {
      throw this.conflict(e);
    }

    // Files no longer used by this product.
    const used = new Set([...dto.imageKeys, ...(dto.videoKey ? [dto.videoKey] : [])]);
    const dropped = [...current.images.map((i) => i.key), ...(current.videoKey ? [current.videoKey] : [])];
    await this.removeFiles(shop.id, dropped.filter((k) => !used.has(k)));
    return this.get(shop.id, id);
  }

  async remove(shop: Shop, id: string): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id, shopId: shop.id },
      include: { images: true, _count: { select: { orderItems: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product._count.orderItems > 0) {
      throw new ConflictException({
        code: 'PRODUCT_HAS_ORDERS',
        message: 'A product that has been ordered can’t be deleted; unpublish it instead',
      });
    }
    await this.prisma.product.delete({ where: { id } });
    await this.removeFiles(shop.id, [...product.images.map((i) => i.key), ...(product.videoKey ? [product.videoKey] : [])]);
  }

  /** Stores a photo for a product being edited; it's attached when the product is saved. */
  async uploadImage(shopId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'No file uploaded' });
    if (file.size > MEDIA_LIMITS.maxImageBytes) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File is too large' });
    }
    const type = detectImage(file.buffer);
    if (!type) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Unsupported image format' });
    const key = `${filePrefix(storageFolder.shopProducts(shopId), 'image')}${randomUUID()}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.type);
    return { key, url: this.media.publicUrl(key) };
  }

  /** Stores the product video, streamed from the temp file multer wrote (see tempFileStorage). */
  async uploadVideo(shopId: string, file: Express.Multer.File | undefined) {
    try {
      if (!file) throw new BadRequestException({ code: 'INVALID_VIDEO', message: 'No file uploaded' });
      if (file.size > MEDIA_LIMITS.maxVideoBytes) {
        throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'File is too large' });
      }
      const head = Buffer.alloc(16);
      const handle = await open(file.path);
      await handle.read(head, 0, head.length, 0).finally(() => handle.close());
      const type = detectVideo(head);
      if (!type) throw new BadRequestException({ code: 'INVALID_VIDEO', message: 'Unsupported video format' });
      const key = `${filePrefix(storageFolder.shopProducts(shopId), 'video')}${randomUUID()}.${type.ext}`;
      await this.storage.putFile(key, file.path, type.type);
      return { key, url: this.media.publicUrl(key) };
    } finally {
      await discardTempFile(file?.path);
    }
  }

  private fields(dto: ShopProductDto) {
    return {
      name: dto.name,
      description: dto.description || null,
      categoryId: dto.categoryId,
      unitId: dto.unitId,
      sku: dto.sku,
      price: dto.price,
      compareAtPrice: dto.compareAtPrice ?? null,
      stock: dto.variants.length ? 0 : dto.stock,
      lowStockThreshold: dto.lowStockThreshold,
      videoKey: dto.videoKey ?? null,
    };
  }

  private variantData(dto: ShopProductDto, v: ShopProductDto['variants'][number]) {
    return { sku: v.sku, attributes: { [dto.variantOption!]: v.value }, price: v.price ?? null, stock: v.stock };
  }

  /** References, prices and media must make sense before anything is written. */
  private async validate(shopId: string, dto: ShopProductDto, existingKeys: string[]) {
    const [category, unit] = await Promise.all([
      this.prisma.category.findFirst({ where: { id: dto.categoryId, isActive: true }, select: { id: true } }),
      this.prisma.unit.findUnique({ where: { id: dto.unitId }, select: { id: true } }),
    ]);
    if (!category) throw new BadRequestException({ code: 'INVALID_CATEGORY', message: 'Unknown category' });
    if (!unit) throw new BadRequestException({ code: 'INVALID_UNIT', message: 'Unknown unit' });

    if (dto.compareAtPrice != null && dto.compareAtPrice <= dto.price) {
      throw new BadRequestException({ code: 'INVALID_COMPARE_PRICE', message: 'Compare-at price must be higher' });
    }
    if (dto.variants.length && !dto.variantOption) {
      throw new BadRequestException({ code: 'VARIANT_OPTION_REQUIRED', message: 'Name the option, e.g. Size' });
    }
    const skus = [dto.sku, ...dto.variants.map((v) => v.sku)].map((s) => s.toLowerCase());
    const values = dto.variants.map((v) => v.value.toLowerCase());
    if (new Set(skus).size !== skus.length || new Set(values).size !== values.length) {
      throw new BadRequestException({ code: 'DUPLICATE_VARIANT', message: 'Options and SKUs must be unique' });
    }
    if (dto.intent === 'publish' && dto.imageKeys.length === 0) {
      throw new BadRequestException({ code: 'IMAGE_REQUIRED', message: 'Add at least one photo to publish' });
    }

    // Only this shop's uploads, or files the product already had (e.g. imported URLs).
    const folder = storageFolder.shopProducts(shopId);
    const allowed = (key: string, label: string) =>
      key.startsWith(filePrefix(folder, label)) || existingKeys.includes(key);
    if (dto.imageKeys.some((k) => !allowed(k, 'image')) || (dto.videoKey && !allowed(dto.videoKey, 'video'))) {
      throw new BadRequestException({ code: 'INVALID_MEDIA', message: 'Unknown media file' });
    }
  }

  /**
   * Status after a save: "draft" takes it off sale; "publish" keeps a published product
   * live, otherwise it goes live or waits for review per the `productModeration` setting.
   */
  private async statusFor(intent: ShopProductDto['intent'], current: ProductStatus): Promise<ProductStatus> {
    if (intent === 'draft') return 'DRAFT';
    if (current === 'PUBLISHED') return 'PUBLISHED';
    const setting = await this.prisma.setting.findUnique({ where: { key: 'productModeration' } });
    return setting?.value === 'post' ? 'PUBLISHED' : 'PENDING';
  }

  private async uniqueSlug(shopId: string, name: string, sku: string): Promise<string> {
    const base = slugify(name, 60) || slugify(sku, 60) || 'product';
    const taken = new Set(
      (
        await this.prisma.product.findMany({
          where: { shopId, slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((p) => p.slug),
    );
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private conflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException({ code: 'SKU_TAKEN', message: 'This SKU is already used in your shop' });
    }
    return e;
  }

  /** Best effort; only this shop's own uploads are ever deleted. */
  private async removeFiles(shopId: string, keys: string[]) {
    const own = storageFolder.shopProducts(shopId);
    await Promise.all(keys.filter((k) => k.startsWith(own)).map((k) => this.storage.remove(k)));
  }
}
