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

  async issue(actorType: ActorType, actorId: string, client: ClientInfo): Promise<IssuedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
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

  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
