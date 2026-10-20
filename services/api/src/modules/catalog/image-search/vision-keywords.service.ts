import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService, replyText } from '../../ai/anthropic.service.js';

export interface PhotoDescription {
  /** Short name of the main item, e.g. "Roasted coffee beans". */
  label: string | null;
  /** Search words in English and Lao, most specific first. */
  keywords: string[];
  /** Best catalog category slug, when one fits. */
  category: string | null;
}

/** Reads the model's JSON reply (tolerating prose around it); unknown categories are dropped. */
export function parseDescription(text: string, categories: { slug: string }[]): PhotoDescription {
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
    label?: unknown;
    keywords_en?: unknown;
    keywords_lo?: unknown;
    category?: unknown;
  };
  const words = (v: unknown) => (Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string' && w.trim().length > 1).map((w) => w.trim()) : []);
  return {
    label: typeof json.label === 'string' ? json.label.slice(0, 80) : null,
    keywords: [...new Set([...words(json.keywords_en), ...words(json.keywords_lo)])].slice(0, 12),
    category: typeof json.category === 'string' && categories.some((c) => c.slug === json.category) ? json.category : null,
  };
}

const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/**
 * Optional second opinion for photo search: Claude names what's in the photo, in English and
 * Lao, so text matches can add to the visual ones. Off unless ANTHROPIC_API_KEY is set.
 */
@Injectable()
export class VisionKeywordsService {
  private readonly logger = new Logger(VisionKeywordsService.name);

  constructor(private readonly claude: AnthropicService) {}

  get enabled(): boolean {
    return this.claude.enabled;
  }

  /** Null when not configured, the image type isn't supported, or the call fails (search still works visually). */
  async describe(bytes: Uint8Array, mediaType: string, categories: { slug: string; name: string }[]): Promise<PhotoDescription | null> {
    if (!this.enabled || !(MEDIA_TYPES as readonly string[]).includes(mediaType)) return null;
    const prompt = [
      'A shopper photographed something they want to buy on Taladonline, a marketplace in Laos.',
      'Identify the main product in the photo. Reply with JSON only, no prose:',
      '{"label": "short product name in English", "keywords_en": ["3-6 search words, most specific first"], "keywords_lo": ["the same in Lao"], "category": "one slug from the list or null"}',
      'Use generic product words (e.g. "coffee beans", "silk skirt", "earbuds"), not brand guesses.',
      'If the photo shows no product, reply {"label": null, "keywords_en": [], "keywords_lo": [], "category": null}.',
      `Categories (slug: name): ${categories.map((c) => `${c.slug}: ${c.name}`).join('; ')}`,
    ].join('\n');
    try {
      const res = await this.claude.messages({
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64') } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
      return parseDescription(replyText(res), categories);
    } catch (e) {
      this.logger.warn(`Photo description failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
