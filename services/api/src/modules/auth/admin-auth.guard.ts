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
import type { AdminRole, AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SessionService } from './session.service.js';

export interface AdminRequest extends Request {
  admin: AdminUser;
  sessionToken: string;
}

const ROLES_KEY = 'adminRoles';
/** Restricts an admin route (or controller) to these roles; Super Admin always passes. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

/** Requires an admin session (`Authorization: Bearer`) and, with @Roles, one of the roles (§2.1 RBAC). */
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
      session?.actorType === 'ADMIN' ? await this.prisma.adminUser.findUnique({ where: { id: session.actorId } }) : null;
    if (!admin?.isActive) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in required' });

    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && admin.role !== 'SUPER_ADMIN' && !roles.includes(admin.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN_ROLE', message: 'Your role cannot do this' });
    }
    req.admin = admin;
    req.sessionToken = token;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().admin);
export const AdminToken = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().sessionToken);
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().ip);
