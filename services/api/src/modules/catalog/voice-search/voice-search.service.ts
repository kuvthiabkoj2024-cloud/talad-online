import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.validation.js';

export const VOICE_SEARCH_LIMITS = {
  /** 16 kHz mono 16-bit WAV: 32 kB a second; recordings stop at 10 s (a little slack). */
  sampleRate: 16_000,
  maxSeconds: 12,
  get maxBytes() {
    return 44 + this.sampleRate * 2 * this.maxSeconds;
  },
};

export type VoiceLocale = 'lo' | 'en';
const LANGUAGE: Record<VoiceLocale, string> = { lo: 'lo-LA', en: 'en-US' };

export interface VoiceTranscript {
  /** What was said ('' when nothing was understood). */
  text: string;
  /** Which language it was heard in. */
  language: VoiceLocale | null;
}

interface RecognizeResponse {
  results?: { alternatives?: { transcript?: string; confidence?: number }[]; languageCode?: string }[];
  error?: { message?: string };
}

/**
 * Voice search: a short recording is turned into words by Google Cloud Speech-to-Text, which
 * listens for Lao and English at once (the site's language first) and picks the one spoken —
 * the shopper doesn't choose. Needs `GOOGLE_SPEECH_API_KEY`; without it browsers listen
 * themselves, in one chosen language.
 */
@Injectable()
export class VoiceSearchService {
  private readonly log = new Logger(VoiceSearchService.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get available(): boolean {
    return !!this.key;
  }

  private get key() {
    return this.config.get('GOOGLE_SPEECH_API_KEY', { infer: true });
  }

  async transcribe(file: Express.Multer.File | undefined, locale: VoiceLocale): Promise<VoiceTranscript> {
    const key = this.key;
    if (!key) throw new ServiceUnavailableException({ code: 'VOICE_SEARCH_UNAVAILABLE', message: 'Voice search is not set up' });
    const samples = file ? wavSamples(file.buffer) : null;
    if (!file || !samples) throw new BadRequestException({ code: 'INVALID_AUDIO', message: 'Send 16 kHz mono WAV audio' });
    if (file.size > VOICE_SEARCH_LIMITS.maxBytes) throw new BadRequestException({ code: 'AUDIO_TOO_LONG', message: 'Keep it under 10 seconds' });

    const other: VoiceLocale = locale === 'lo' ? 'en' : 'lo';
    const res = await fetch(`https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: VOICE_SEARCH_LIMITS.sampleRate,
          audioChannelCount: 1,
          languageCode: LANGUAGE[locale],
          alternativeLanguageCodes: [LANGUAGE[other]],
          maxAlternatives: 1,
          profanityFilter: false,
        },
        audio: { content: samples.toString('base64') },
      }),
    }).catch((e: unknown) => {
      this.log.warn(`Speech-to-Text unreachable: ${String(e)}`);
      return null;
    });
    const json = (await res?.json().catch(() => null)) as RecognizeResponse | null;
    if (!res?.ok || !json) {
      this.log.warn(`Speech-to-Text failed (${res?.status ?? 'network'}): ${json?.error?.message ?? ''}`);
      throw new ServiceUnavailableException({ code: 'VOICE_SEARCH_UNAVAILABLE', message: 'Voice search failed, please try again' });
    }

    const results = json.results ?? [];
    const text = results
      .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? '')
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const code = results.find((r) => r.languageCode)?.languageCode?.toLowerCase() ?? '';
    return { text: text.slice(0, 100), language: code.startsWith('lo') ? 'lo' : code.startsWith('en') ? 'en' : null };
  }
}

/**
 * The PCM samples of a RIFF/WAVE file holding 16-bit mono audio at the expected rate (as the
 * storefront records it), or null. Walks the chunks, so extra ones (LIST, FLLR…) are fine.
 */
export function wavSamples(b: Buffer): Buffer | null {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmtOk = false;
  for (let at = 12; at + 8 <= b.length; ) {
    const id = b.toString('ascii', at, at + 4);
    const size = b.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= b.length) {
      fmtOk =
        b.readUInt16LE(body) === 1 && // PCM
        b.readUInt16LE(body + 2) === 1 && // mono
        b.readUInt32LE(body + 4) === VOICE_SEARCH_LIMITS.sampleRate &&
        b.readUInt16LE(body + 14) === 16;
    } else if (id === 'data') {
      const samples = b.subarray(body, Math.min(b.length, body + size));
      return fmtOk && samples.length >= 3200 ? samples : null; // at least 0.1 s
    }
    at = body + size + (size % 2);
  }
  return null;
}
