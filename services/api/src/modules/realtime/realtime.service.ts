import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { RealtimeEvent } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { Env } from '../../config/env.validation.js';
import type { Prisma } from '../../generated/prisma/client.js';

const CHANNEL = 'talad_realtime';
/** Postgres caps a NOTIFY payload at 8000 bytes; events are kept well under. */
const MAX_PAYLOAD = 7500;
const HEARTBEAT_MS = 25_000;

/** Who an event is for: one customer account, one shop (Seller Center) or one admin. */
export type { RealtimeEvent };
export type Audience = `customer:${string}` | `shop:${string}` | `admin:${string}`;

type Db = Pick<Prisma.TransactionClient, '$executeRaw'>;
type Listener = (event: RealtimeEvent) => void;
/** Runs once per event, on the instance that published it, after its transaction committed. */
export type CommittedHook = (to: Audience[], event: RealtimeEvent) => void;

/**
 * Real-time events to signed-in apps over Server-Sent Events.
 *
 * Events are published with Postgres `pg_notify`: sent inside a transaction, Postgres only
 * delivers them once it commits (nothing is announced for a rolled-back order), and every API
 * instance listening on the channel gets them, so this keeps working with several servers.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly listeners = new Map<Audience, Set<Listener>>();
  private readonly committedHooks = new Set<CommittedHook>();
  /** Tags this process's events, so only it runs the committed hooks (not every instance). */
  private readonly origin = randomUUID();
  private client: pg.Client | null = null;
  private stopped = false;
  private retryMs = 1000;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit() {
    await this.listen();
  }

  async onModuleDestroy() {
    this.stopped = true;
    await this.client?.end().catch(() => {});
  }

  /**
   * Publishes `event` to `to`. Pass the transaction (`tx`) when the change it announces is
   * being written in one, so the event only goes out if it commits.
   */
  async emit(db: Db, to: Audience | Audience[], event: RealtimeEvent): Promise<void> {
    const payload = JSON.stringify({ to: Array.isArray(to) ? to : [to], event, origin: this.origin });
    if (Buffer.byteLength(payload) > MAX_PAYLOAD) {
      this.logger.warn(`Realtime event too large (${Buffer.byteLength(payload)} bytes), not sent`);
      return;
    }
    await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;
  }

  /**
   * Calls `hook` for every event this instance publishes, once it is committed (Web Push
   * sends from here, so a rolled-back order never buzzes a phone).
   */
  onCommitted(hook: CommittedHook): () => void {
    this.committedHooks.add(hook);
    return () => this.committedHooks.delete(hook);
  }

  /** Keeps `res` open as an event stream for `audiences` until the client disconnects. */
  stream(res: Response, audiences: Audience[]): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Proxies (nginx) must pass events through as they come.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    // Reconnect after 5 s if the connection drops.
    res.write('retry: 5000\n\n');
    res.write(`event: ready\ndata: {}\n\n`);

    const send: Listener = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
    for (const a of audiences) {
      const set = this.listeners.get(a) ?? new Set();
      set.add(send);
      this.listeners.set(a, set);
    }
    // A comment line now and then keeps idle connections (and proxies) from timing out.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    res.on('close', () => {
      clearInterval(heartbeat);
      for (const a of audiences) {
        const set = this.listeners.get(a);
        set?.delete(send);
        if (set && !set.size) this.listeners.delete(a);
      }
    });
  }

  /** Open streams (for logs and tests). */
  get connections(): number {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }

  private dispatch(raw: string) {
    let msg: { to: Audience[]; event: RealtimeEvent; origin?: string };
    try {
      msg = JSON.parse(raw) as { to: Audience[]; event: RealtimeEvent; origin?: string };
    } catch {
      return;
    }
    for (const a of msg.to) for (const fn of this.listeners.get(a) ?? []) fn(msg.event);
    if (msg.origin === this.origin) for (const hook of this.committedHooks) hook(msg.to, msg.event);
  }

  /** One dedicated connection that LISTENs; reconnects with backoff if it drops. */
  private async listen(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({ connectionString: this.config.get('DATABASE_URL', { infer: true }) });
    client.on('notification', (n) => n.channel === CHANNEL && n.payload && this.dispatch(n.payload));
    client.on('error', (e) => {
      this.logger.warn(`Realtime listener lost its connection: ${e.message}`);
      void client.end().catch(() => {});
      this.reconnect();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.client = client;
      this.retryMs = 1000;
    } catch (e) {
      this.logger.warn(`Realtime listener couldn't connect: ${e instanceof Error ? e.message : String(e)}`);
      void client.end().catch(() => {});
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.stopped) return;
    this.client = null;
    const wait = this.retryMs;
    this.retryMs = Math.min(30_000, this.retryMs * 2);
    setTimeout(() => void this.listen(), wait).unref();
  }
}
