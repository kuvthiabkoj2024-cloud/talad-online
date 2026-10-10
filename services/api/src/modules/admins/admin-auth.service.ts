import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import type { Env } from '../../config/env.validation.js';
import type { AdminRole, AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CHALLENGE_TTL_MS, readChallenge, signChallenge } from '../auth/challenge.js';
import { EmailService } from '../auth/email.service.js';
import { SessionService, type ClientInfo } from '../auth/session.service.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../auth/totp.js';

/** Admin sessions are short-lived: a working day. */
const ADMIN_SESSION_MS = 12 * 3_600_000;
export const ADMIN_PASSWORD_MIN = 10;
/** Reset links work once, for 30 minutes. */
const RESET_TTL_MS = 30 * 60_000;
const RESET_PURPOSE = 'admin_reset';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface AdminProfile {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  /** Authenticator app (TOTP) is the only second step for staff; they have no phone on file. */
  twoFactor: boolean;
  createdAt: Date;
}

export const toProfile = (a: AdminUser): AdminProfile => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  isActive: a.isActive,
  twoFactor: a.twoFactorMethod === 'TOTP',
  createdAt: a.createdAt,
});

/** Admin console sign-in (§2.1) and staff accounts (Super Admin only). */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(email: string, password: string, client: ClientInfo) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
    // Same answer for unknown email and wrong password.
    const ok = admin ? await argon2.verify(admin.passwordHash, password).catch(() => false) : false;
    if (!admin || !ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Wrong email or password' });
    if (!admin.isActive) throw new UnauthorizedException({ code: 'ACCOUNT_DISABLED', message: 'This admin account is disabled' });
    if (admin.twoFactorMethod === 'TOTP' && admin.totpSecret) {
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
      return { twoFactor: { method: 'TOTP' as const, challenge: signChallenge(this.secret(), 'admin', admin.id, 'TOTP', expiresAt), expiresAt } };
    }
    return this.startSession(admin, client);
  }

  /** Second step: the authenticator code for a login challenge. */
  async verifyTwoFactor(challenge: string, code: string, client: ClientInfo) {
    const read = readChallenge(this.secret(), 'admin', challenge);
    const admin = read && (await this.prisma.adminUser.findUnique({ where: { id: read.id } }));
    if (!admin?.isActive) throw new BadRequestException({ code: 'CHALLENGE_EXPIRED', message: 'Sign-in expired, start again' });
    if (!admin.totpSecret || !verifyTotp(admin.totpSecret, code)) {
      throw new BadRequestException({ code: 'TWO_FACTOR_INVALID', message: 'Incorrect code' });
    }
    return this.startSession(admin, client);
  }

  /**
   * Emails a one-time reset link. The answer is the same whether or not the email belongs to
   * an active admin, so the form can't be used to discover staff accounts.
   */
  async forgotPassword(email: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!admin?.isActive) return { sent: true };
    const token = randomBytes(32).toString('base64url');
    await this.prisma.$transaction([
      this.prisma.oneTimeCode.updateMany({
        where: { actorType: 'ADMIN', actorId: admin.id, purpose: RESET_PURPOSE, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.oneTimeCode.create({
        data: { actorType: 'ADMIN', actorId: admin.id, purpose: RESET_PURPOSE, codeHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
      }),
    ]);
    const link = `${this.config.get('ADMIN_APP_URL', { infer: true }).replace(/\/$/, '')}/reset-password?token=${token}`;
    await this.email.send(
      admin.email,
      'Reset your Taladonline Admin password',
      `Hi ${admin.name},\n\nOpen this link within 30 minutes to choose a new password:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    );
    await this.audit.log({ adminId: admin.id, action: 'admin.password_reset_requested', entityType: 'AdminUser', entityId: admin.id });
    const dev = this.config.get('NODE_ENV', { infer: true }) !== 'production';
    return { sent: true, ...(dev && { devLink: link }) };
  }

  /** Sets a new password from a reset link; every session is signed out. */
  async resetPassword(token: string, password: string) {
    const otp = await this.prisma.oneTimeCode.findFirst({
      where: { actorType: 'ADMIN', purpose: RESET_PURPOSE, codeHash: sha256(token), consumedAt: null, expiresAt: { gt: new Date() } },
    });
    const admin = otp && (await this.prisma.adminUser.findUnique({ where: { id: otp.actorId } }));
    if (!otp || !admin?.isActive) throw new BadRequestException({ code: 'RESET_LINK_INVALID', message: 'This reset link has expired or was already used' });
    await this.prisma.$transaction([
      this.prisma.oneTimeCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
      this.prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await argon2.hash(password) } }),
      this.prisma.session.updateMany({ where: { actorType: 'ADMIN', actorId: admin.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ adminId: admin.id, action: 'admin.password_reset', entityType: 'AdminUser', entityId: admin.id });
  }

  /** A new authenticator secret; it takes effect once confirmed with a code. */
  async totpSetup(admin: AdminUser) {
    if (admin.twoFactorMethod === 'TOTP') throw new ConflictException({ code: 'TWO_FACTOR_ON', message: 'Turn off the authenticator first' });
    const secret = generateTotpSecret();
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { totpSecret: secret } });
    const uri = totpUri(secret, admin.email, 'Taladonline Admin');
    return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  }

  async totpEnable(admin: AdminUser, code: string) {
    if (!admin.totpSecret || !verifyTotp(admin.totpSecret, code)) throw new BadRequestException({ code: 'TWO_FACTOR_INVALID', message: 'Incorrect code' });
    const saved = await this.prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorMethod: 'TOTP' } });
    await this.audit.log({ adminId: admin.id, action: 'admin.2fa_on', entityType: 'AdminUser', entityId: admin.id });
    return toProfile(saved);
  }

  async totpDisable(admin: AdminUser, code: string) {
    if (admin.twoFactorMethod !== 'TOTP' || !admin.totpSecret || !verifyTotp(admin.totpSecret, code)) {
      throw new BadRequestException({ code: 'TWO_FACTOR_INVALID', message: 'Incorrect code' });
    }
    const saved = await this.prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorMethod: 'NONE', totpSecret: null } });
    await this.audit.log({ adminId: admin.id, action: 'admin.2fa_off', entityType: 'AdminUser', entityId: admin.id });
    return toProfile(saved);
  }

  private secret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  private async startSession(admin: AdminUser, client: ClientInfo) {
    const session = await this.sessions.issue('ADMIN', admin.id, client, ADMIN_SESSION_MS);
    await this.audit.log({ adminId: admin.id, action: 'admin.login', entityType: 'AdminUser', entityId: admin.id, ip: client.ip });
    return { ...session, admin: toProfile(admin) };
  }

  logout(token: string) {
    return this.sessions.revoke(token);
  }

  /** Changing the password signs out every other session (§2.1 forced logout). */
  async changePassword(admin: AdminUser, token: string, current: string, next: string) {
    if (!(await argon2.verify(admin.passwordHash, current).catch(() => false))) {
      throw new BadRequestException({ code: 'WRONG_PASSWORD', message: 'Current password is wrong' });
    }
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await argon2.hash(next) } });
    await this.sessions.revokeFor('ADMIN', admin.id, token);
    await this.audit.log({ adminId: admin.id, action: 'admin.password', entityType: 'AdminUser', entityId: admin.id });
  }

  async list(): Promise<AdminProfile[]> {
    return (await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } })).map(toProfile);
  }

  async create(by: AdminUser, input: { email: string; name: string; role: AdminRole; password: string }) {
    const email = input.email.trim().toLowerCase();
    if (await this.prisma.adminUser.findUnique({ where: { email } })) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'An admin with this email exists' });
    }
    const admin = await this.prisma.adminUser.create({
      data: { email, name: input.name.trim(), role: input.role, passwordHash: await argon2.hash(input.password) },
    });
    await this.audit.log({ adminId: by.id, action: 'admin.create', entityType: 'AdminUser', entityId: admin.id, changes: { email, role: input.role } });
    return toProfile(admin);
  }

  /** Role / active / password reset. Disabling or resetting signs the account out everywhere. */
  async update(by: AdminUser, id: string, input: { name?: string; role?: AdminRole; isActive?: boolean; password?: string; resetTwoFactor?: boolean }) {
    const target = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Admin not found');
    if (target.id === by.id && (input.isActive === false || (input.role && input.role !== 'SUPER_ADMIN'))) {
      throw new BadRequestException({ code: 'SELF_LOCKOUT', message: 'You cannot disable or demote yourself' });
    }
    // Keep at least one active Super Admin.
    if (target.role === 'SUPER_ADMIN' && (input.isActive === false || (input.role && input.role !== 'SUPER_ADMIN'))) {
      const supers = await this.prisma.adminUser.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
      if (supers <= 1) throw new BadRequestException({ code: 'LAST_SUPER_ADMIN', message: 'Keep at least one Super Admin' });
    }
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        ...(input.name && { name: input.name.trim() }),
        ...(input.role && { role: input.role }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.password && { passwordHash: await argon2.hash(input.password) }),
        // For staff who lost their authenticator; they can set it up again after signing in.
        ...(input.resetTwoFactor && { twoFactorMethod: 'NONE', totpSecret: null }),
      },
    });
    if (input.isActive === false || input.password || input.resetTwoFactor) {
      await this.prisma.session.updateMany({ where: { actorType: 'ADMIN', actorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await this.audit.log({
      adminId: by.id,
      action: 'admin.update',
      entityType: 'AdminUser',
      entityId: id,
      changes: { ...input, password: input.password ? '(reset)' : undefined },
    });
    return toProfile(updated);
  }
}
