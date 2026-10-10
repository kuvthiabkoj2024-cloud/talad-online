import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { ActorType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Opaque, database-backed sessions: the client holds a random token, the database
 * only its hash. Revoking the row logs the device out immediately.
 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(actorType: ActorType, actorId: string, client: ClientInfo, ttlMs = SESSION_TTL_MS): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.prisma.session.create({
      data: {
        actorType,
        actorId,
        refreshTokenHash: hashToken(token),
        userAgent: client.userAgent?.slice(0, 500),
        ipAddress: client.ip,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /** The active session for a token, or null when unknown, expired or revoked. */
  async resolve(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(token) },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    return session;
  }

  /** An account's sessions, newest first: active ones and recent sign-in history. */
  async list(actorType: ActorType, actorId: string, currentToken: string) {
    const rows = await this.prisma.session.findMany({
      where: { actorType, actorId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const now = new Date();
    const current = hashToken(currentToken);
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      active: !s.revokedAt && s.expiresAt > now,
      current: s.refreshTokenHash === current,
    }));
  }

  /** Signs out one device (`id`), or every device except the current one. */
  async revokeFor(actorType: ActorType, actorId: string, currentToken: string, id?: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: {
        actorType,
        actorId,
        revokedAt: null,
        refreshTokenHash: { not: hashToken(currentToken) },
        ...(id && { id }),
      },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
