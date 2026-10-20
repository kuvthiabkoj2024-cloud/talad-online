import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ProductsService, type ProductCard } from '../products/products.service.js';
import { ClipService } from './clip.service.js';
import { ImageIndexService } from './image-index.service.js';
import { VisionKeywordsService } from './vision-keywords.service.js';

export const PHOTO_SEARCH_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
} as const;

/**
 * Cut-offs on the fused score (photo similarity + product-name match, see ImageIndexService):
 * right products score ≈ 0.95–1.25 on the demo catalog, wrong ones ≤ ~0.78. A match must
 * clear MIN *and* be within WINDOW of the best; STRONG and above is a close match.
 */
const MIN = 0.8;
const WINDOW = 0.15;
const STRONG = 0.92;
const LIMIT = 40;
/**
 * Related products (not a match): a weaker visual match, or a product whose *name* clearly
 * relates to the photo even though it looks nothing alike — a cat photo → "Dry cat food".
 * Name scores for related products sit ≥ ~0.25; unrelated photos stay ≤ ~0.21 (demo catalog).
 */
const MIN_RELATED = 0.72;
const RELATED_WINDOW = 0.35;
const RELATED_NAME = 0.235;
const RELATED_LIMIT = 12;

export type MatchKind = 'visual' | 'keyword' | 'both';

export interface PhotoMatch extends ProductCard {
  match: { score: number; by: MatchKind; strong: boolean };
}

export interface PhotoSearchResult {
  /** Products that match the photo. */
  items: PhotoMatch[];
  /** Related products (same kind of thing, or related by name), not matches. */
  related: PhotoMatch[];
  /** What the photo shows, when the AI description is on. */
  label: string | null;
  keywords: string[];
  category: string | null;
  engines: { visual: boolean; ai: boolean };
}

/**
 * "Scan to search" (§5): finds products that look like the shopper's photo (local CLIP
 * embeddings) and, when configured, products matching Claude's description of it.
 */
@Injectable()
export class PhotoSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly clip: ClipService,
    private readonly index: ImageIndexService,
    private readonly vision: VisionKeywordsService,
  ) {}

  /** Matches for the photo, plus related products listed separately. */
  async search(file?: Express.Multer.File, { limit = LIMIT }: { limit?: number } = {}): Promise<PhotoSearchResult> {
    if (!file) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Attach a photo' });
    if (!(PHOTO_SEARCH_LIMITS.mimeTypes as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Use a JPG, PNG or WebP photo' });
    }
    if (file.size > PHOTO_SEARCH_LIMITS.maxBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Photo is too large' });
    const engines = { visual: this.clip.enabled, ai: this.vision.enabled };
    if (!engines.visual && !engines.ai) {
      throw new ServiceUnavailableException({ code: 'IMAGE_SEARCH_UNAVAILABLE', message: 'Photo search is turned off' });
    }

    const bytes = new Uint8Array(file.buffer);
    const [visual, described] = await Promise.all([
      engines.visual
        ? this.clip.embed(bytes).then(
            async (v) => {
              const ranked = await this.index.matchPhoto(v, limit + RELATED_LIMIT);
              const best = ranked[0]?.score ?? 0;
              const matches = ranked.filter((h) => h.score >= MIN && h.score >= best - WINDOW).slice(0, limit);
              const taken = new Set(matches.map((h) => h.productId));
              const related = ranked
                .filter((h) => !taken.has(h.productId) && ((h.score >= MIN_RELATED && h.score >= best - RELATED_WINDOW) || h.name >= RELATED_NAME))
                .slice(0, RELATED_LIMIT);
              return { matches, related };
            },
            () => {
              throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Couldn’t read this photo' });
            },
          )
        : Promise.resolve({ matches: [], related: [] }),
      engines.ai ? this.categories().then((cats) => this.vision.describe(bytes, file.mimetype, cats)) : Promise.resolve(null),
    ]);
    const keyword = described ? await this.products.keywordMatches(described.keywords, described.category, limit) : [];

    // Merge: the fused visual score as is; keyword hits mapped onto a comparable 0.8–1.1 scale.
    const merged = new Map<string, { score: number; by: MatchKind }>();
    for (const v of visual.matches) merged.set(v.productId, { score: v.score, by: 'visual' });
    for (const k of keyword) {
      const score = Math.min(1.1, 0.8 + 0.08 * k.hits);
      const seen = merged.get(k.productId);
      merged.set(k.productId, seen ? { score: Math.max(seen.score, score) + 0.05, by: 'both' } : { score, by: 'keyword' });
    }
    const ranked = [...merged.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit);
    const relatedRanked = visual.related.filter((r) => !merged.has(r.productId));
    const [cards, relatedCards] = await Promise.all([
      this.products.cardsByIds(ranked.map(([id]) => id)),
      this.products.cardsByIds(relatedRanked.map((r) => r.productId)),
    ]);
    const byId = new Map(ranked);
    const relatedScore = new Map(relatedRanked.map((r) => [r.productId, r.score]));
    return {
      items: cards.map((c) => {
        const m = byId.get(c.id)!;
        return { ...c, match: { score: Math.round(m.score * 100) / 100, by: m.by, strong: m.score >= STRONG } };
      }),
      related: relatedCards.map((c) => ({ ...c, match: { score: Math.round((relatedScore.get(c.id) ?? 0) * 100) / 100, by: 'visual' as const, strong: false } })),
      label: described?.label ?? null,
      keywords: described?.keywords ?? [],
      category: described?.category ?? null,
      engines,
    };
  }

  private async categories() {
    const rows = await this.prisma.category.findMany({ where: { isActive: true }, select: { slug: true, name: true } });
    return rows.map((c) => {
      const name = c.name as { en?: string; lo?: string };
      return { slug: c.slug, name: name.en ?? name.lo ?? c.slug };
    });
  }
}
