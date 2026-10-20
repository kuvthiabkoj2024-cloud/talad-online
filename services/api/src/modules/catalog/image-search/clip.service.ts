import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import type { Env } from '../../../config/env.validation.js';

/** Open CLIP model (ViT-B/32, 8-bit), run locally through ONNX: ~90 MB, downloaded once. */
export const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

type ClipText = {
  tokenizer: (texts: string[], options: { padding: boolean; truncation: boolean }) => unknown;
  model: (inputs: unknown) => Promise<{ text_embeds: { data: Float32Array } }>;
};

type Clip = {
  processor: (image: unknown) => Promise<unknown>;
  model: (inputs: unknown) => Promise<{ image_embeds: { data: Float32Array } }>;
  RawImage: { fromBlob: (blob: Blob) => Promise<unknown> };
};

/** Turns an image into a 512-number "fingerprint"; similar-looking photos get similar vectors. */
@Injectable()
export class ClipService {
  private readonly logger = new Logger(ClipService.name);
  private loading?: Promise<Clip>;
  private loadingText?: Promise<ClipText>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return this.config.get('IMAGE_SEARCH_ENABLED', { infer: true }) !== 'false';
  }

  /** Loads the model (downloading it the first time); throws when it can't. */
  async ready(): Promise<void> {
    await this.load();
  }

  /** L2-normalized embedding, so a dot product between two is their cosine similarity. */
  async embed(bytes: Uint8Array): Promise<number[]> {
    const clip = await this.load();
    const image = await clip.RawImage.fromBlob(new Blob([new Uint8Array(bytes)]));
    const { image_embeds } = await clip.model(await clip.processor(image));
    return normalize(Array.from(image_embeds.data));
  }

  /**
   * Text in the same space as photo embeddings ("headphones" lands near earbud photos).
   * English only — the model doesn't know Lao script.
   */
  async embedText(text: string): Promise<number[]> {
    const clip = await this.loadText();
    const { text_embeds } = await clip.model(clip.tokenizer([`a photo of ${text}`], { padding: true, truncation: true }));
    return normalize(Array.from(text_embeds.data));
  }

  private loadText(): Promise<ClipText> {
    this.loadingText ??= (async () => {
      const t = await import('@huggingface/transformers');
      t.env.cacheDir = resolve(this.config.get('MODEL_CACHE_DIR', { infer: true }));
      const [tokenizer, model] = await Promise.all([
        t.AutoTokenizer.from_pretrained(CLIP_MODEL),
        t.CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'q8' }),
      ]);
      return { tokenizer, model } as unknown as ClipText;
    })().catch((e: unknown) => {
      this.loadingText = undefined;
      throw e;
    });
    return this.loadingText;
  }

  private load(): Promise<Clip> {
    // Imported lazily: the ONNX runtime only loads when photo search is first used.
    this.loading ??= (async () => {
      const t = await import('@huggingface/transformers');
      t.env.cacheDir = resolve(this.config.get('MODEL_CACHE_DIR', { infer: true }));
      const started = Date.now();
      const [processor, model] = await Promise.all([
        t.AutoProcessor.from_pretrained(CLIP_MODEL),
        t.CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'q8' }),
      ]);
      this.logger.log(`Image model ready in ${Date.now() - started} ms`);
      return { processor, model, RawImage: t.RawImage } as unknown as Clip;
    })().catch((e: unknown) => {
      this.loading = undefined;
      throw e;
    });
    return this.loading;
  }
}

function normalize(v: number[]): number[] {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}
