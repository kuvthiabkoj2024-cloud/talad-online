import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MessageResponse {
  content: ContentBlock[];
  /** e.g. "end_turn", "tool_use", "max_tokens". */
  stop_reason: string;
}

const TIMEOUT_MS = 30_000;

/**
 * Minimal Claude Messages API client (photo search descriptions, Market Chat). Off unless
 * ANTHROPIC_API_KEY is set; callers fall back to non-AI behaviour when a call throws.
 */
@Injectable()
export class AnthropicService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get enabled(): boolean {
    return !!this.config.get('ANTHROPIC_API_KEY', { infer: true });
  }

  async messages(body: {
    system?: string;
    messages: Message[];
    tools?: Tool[];
    /** `none`: answer in text now (no more tool calls). */
    tool_choice?: { type: 'auto' | 'any' | 'none' };
    max_tokens: number;
  }): Promise<MessageResponse> {
    const key = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.config.get('ANTHROPIC_MODEL', { infer: true }), ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Claude API HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as MessageResponse;
  }
}

/** The text of a response (all text blocks joined). */
export const replyText = (r: MessageResponse) =>
  r.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('\n')
    .trim();
