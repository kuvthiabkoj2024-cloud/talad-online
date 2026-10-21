import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { effectivePermissions, type AdminPermission } from '@talad/shared';
import type { AdminRole, AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionService } from './session.service.js';

/** The signed-in admin with their role (and so their permissions). */
export type AdminWithRole = AdminUser & { role: AdminRole };

export interface AdminRequest extends Request {
  admin: AdminWithRole;
  sessionToken: string;
}

const PERMISSIONS_KEY = 'adminPermissions';
const SUPER_KEY = 'adminSuperOnly';
/**
 * Restricts an admin route (or controller) to admins with one of these permissions; a
 * route's own decorator overrides its controller's. Super Admins always pass.
 */
export const Permission = (...permissions: AdminPermission[]) => SetMetadata(PERMISSIONS_KEY, permissions);
/** Super Admins only: managing admins and roles (no permission grants it, so nobody can raise their own access). */
export const SuperAdminOnly = () => SetMetadata(SUPER_KEY, true);

/** What this admin may do: everything for Super Admins, otherwise their role's (or own) permissions. */
export function adminCan(admin: AdminWithRole, permission: AdminPermission): boolean {
  return admin.role.isSuper || effectivePermissions(admin).includes(permission);
}

/** Requires an admin session (`Authorization: Bearer`) and, with @Permission, one of the permissions (§2.1 RBAC). */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const session = scheme === 'Bearer' && token ? await this.sessions.resolve(token) : null;
    const admin =
      session?.actorType === 'ADMIN' ? await this.prisma.adminUser.findUnique({ where: { id: session.actorId }, include: { role: true } }) : null;
    if (!admin?.isActive) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in required' });

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(SUPER_KEY, targets) && !admin.role.isSuper) {
      throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'Only a Super Admin can do this' });
    }
    const needed = this.reflector.getAllAndOverride<AdminPermission[] | undefined>(PERMISSIONS_KEY, targets);
    if (needed?.length && !needed.some((p) => adminCan(admin, p))) {
      throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'You don’t have permission to do this' });
    }
    req.admin = admin;
    req.sessionToken = token;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().admin);
export const AdminToken = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().sessionToken);
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().ip);
