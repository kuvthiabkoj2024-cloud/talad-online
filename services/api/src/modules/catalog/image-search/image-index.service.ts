import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MediaService } from '../../media/media.service.js';
import { CLIP_MODEL, ClipService } from './clip.service.js';

/** Photos indexed per sweep; sweeps run every minute and right after new photos are saved. */
const BATCH = 25;
const SWEEP_MS = 60_000;
/** The in-memory index is rebuilt at most this often (new photos, unpublished products…). */
const INDEX_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 15_000;
const FAILED = `failed:${CLIP_MODEL}`;

interface Entry {
  productId: string;
  vector: Float32Array;
}

/** A visible product's name + category, embedded as text in the same space as photos. */
interface NameEntry {
  productId: string;
  vector: Float32Array;
}

export interface PhotoMatchScore {
  productId: string;
  /** Combined score: looks like the product's photos + is what its name says. */
  score: number;
  /** Best photo-to-photo similarity (0–1). */
  image: number;
  /** Photo-to-name similarity (CLIP zero-shot; ~0.25+ when the name describes the photo). */
  name: number;
}

/**
 * Photo-to-photo similarity alone is fooled by colour and shape (black earbuds vs a white
 * catalog photo → a white power bank). Matching the photo against product names ("a photo
 * of wireless earbuds") recognises *what* it is. Fused: image + NAME_WEIGHT × (name − NAME_BASE).
 * Calibrated on the demo catalog: right products ≈ 0.95–1.25, wrong ones ≤ ~0.78.
 */
const NAME_WEIGHT = 2.5;
const NAME_BASE = 0.2;
/** Products with no indexed photo yet still rank by name, from this image baseline. */
const NO_PHOTO_IMAGE = 0.6;

/**
 * Keeps a CLIP embedding for every product photo (computed in the background) and answers
 * "which products look like this photo?" from an in-memory index of visible products.
 */
@Injectable()
export class ImageIndexService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ImageIndexService.name);
  private timer?: NodeJS.Timeout;
  private sweeping = false;
  private index?: { builtAt: number; entries: Entry[]; names: NameEntry[] };
  private building?: Promise<{ entries: Entry[]; names: NameEntry[] }>;
  /** Name embeddings by product id, kept across rebuilds; recomputed when the text changes. */
  private readonly nameCache = new Map<string, { text: string; vector: Float32Array }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly clip: ClipService,
  ) {}

  onApplicationBootstrap() {
    if (!this.clip.enabled || process.env.NODE_ENV === 'test') return;
    // Retry photos that failed before a restart (e.g. the CDN was down), then keep up with new ones.
    void this.prisma.productImage
      .updateMany({ where: { embeddingModel: FAILED }, data: { embeddingModel: null } })
      .then(() => this.sweep());
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Call after saving product photos; indexing runs in the background. */
  requestSweep() {
    if (this.clip.enabled) setTimeout(() => void this.sweep(), 500);
  }

  /** How many photos are indexed / waiting (for logs and the admin). */
  async status() {
    const [indexed, pending] = await Promise.all([
      this.prisma.productImage.count({ where: { embeddingModel: CLIP_MODEL } }),
      this.prisma.productImage.count({ where: { OR: [{ embeddingModel: null }, { NOT: { embeddingModel: { in: [CLIP_MODEL, FAILED] } } }] } }),
    ]);
    return { model: CLIP_MODEL, indexed, pending };
  }

  /**
   * Visible products ranked for a shopper's photo by the fused score (looks like its photos
   * and matches its name), best first.
   */
  async matchPhoto(vector: number[], limit: number): Promise<PhotoMatchScore[]> {
    const { entries, names } = await this.load();
    const image = new Map<string, number>();
    for (const e of entries) {
      const s = dot(e.vector, vector);
      if (s > (image.get(e.productId) ?? -1)) image.set(e.productId, s);
    }
    return names
      .map(({ productId, vector: v }) => {
        const name = dot(v, vector);
        const img = image.get(productId) ?? NO_PHOTO_IMAGE;
        return { productId, image: img, name, score: img + NAME_WEIGHT * (name - NAME_BASE) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Visible products ranked by their best-matching photo; `score` is cosine similarity (0–1). */
  async similar(vector: number[], limit: number, minScore: number): Promise<{ productId: string; score: number }[]> {
    const { entries } = await this.load();
    const best = new Map<string, number>();
    for (const e of entries) {
      const s = dot(e.vector, vector);
      if (s >= minScore && s > (best.get(e.productId) ?? -1)) best.set(e.productId, s);
    }
    return [...best.entries()]
      .map(([productId, score]) => ({ productId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async load(): Promise<{ entries: Entry[]; names: NameEntry[] }> {
    if (this.index && Date.now() - this.index.builtAt < INDEX_TTL_MS) return this.index;
    this.building ??= this.build().finally(() => (this.building = undefined));
    return this.building;
  }

  private async build() {
    const visible = { status: 'PUBLISHED', shop: { status: 'APPROVED' } } as const;
    const [rows, products] = await Promise.all([
      this.prisma.productImage.findMany({ where: { embeddingModel: CLIP_MODEL, product: visible }, select: { productId: true, embedding: true } }),
      this.prisma.product.findMany({ where: visible, select: { id: true, name: true, category: { select: { name: true } } } }),
    ]);
    const entries = rows.map((r) => ({ productId: r.productId, vector: Float32Array.from(r.embedding) }));
    const names: NameEntry[] = [];
    for (const p of products) {
      const category = (p.category.name as { en?: string }).en ?? '';
      const text = category ? `${p.name}, ${category}` : p.name;
      let cached = this.nameCache.get(p.id);
      if (cached?.text !== text) {
        try {
          cached = { text, vector: Float32Array.from(await this.clip.embedText(text)) };
          this.nameCache.set(p.id, cached);
        } catch (e) {
          this.logger.warn(`Couldn't embed the name of product ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
      }
      names.push({ productId: p.id, vector: cached.vector });
    }
    this.index = { builtAt: Date.now(), entries, names };
    return this.index;
  }

  /** Embeds photos that have no embedding for the current model yet. */
  private async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      let ready = false;
      for (;;) {
        const batch = await this.prisma.productImage.findMany({
          where: { OR: [{ embeddingModel: null }, { NOT: { embeddingModel: { in: [CLIP_MODEL, FAILED] } } }] },
          select: { id: true, key: true },
          take: BATCH,
        });
        if (!batch.length) break;
        // Load the model before touching photos, so a failed download doesn't mark them all failed.
        if (!ready) {
          await this.clip.ready();
          ready = true;
        }
        for (const img of batch) await this.indexOne(img);
        this.index = undefined;
        this.logger.log(`Indexed ${batch.length} product photos for photo search`);
      }
    } catch (e) {
      this.logger.warn(`Photo indexing paused: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.sweeping = false;
    }
  }

  private async indexOne(img: { id: string; key: string }) {
    try {
      const res = await fetch(this.media.publicUrl(img.key), {
        // Wikimedia (demo photos) asks clients to identify themselves.
        headers: { 'User-Agent': 'TaladonlineImageIndexer/1.0 (+https://taladonline.com)' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const embedding = await this.clip.embed(new Uint8Array(await res.arrayBuffer()));
      await this.prisma.productImage.update({ where: { id: img.id }, data: { embedding, embeddingModel: CLIP_MODEL, embeddedAt: new Date() } });
    } catch (e) {
      this.logger.warn(`Couldn't index photo ${img.id}: ${e instanceof Error ? e.message : String(e)}`);
      await this.prisma.productImage.update({ where: { id: img.id }, data: { embeddingModel: FAILED, embeddedAt: new Date() } });
    }
  }
}

function dot(a: Float32Array, b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
