import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Customer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authError } from './auth-errors.js';
import { SessionService } from './session.service.js';

export interface CustomerRequest extends Request {
  customer: Customer;
  sessionToken: string;
}

/** Requires `Authorization: Bearer <session token>` belonging to an active customer. */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CustomerRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const session = scheme === 'Bearer' && token ? await this.sessions.resolve(token) : null;
    const customer =
      session?.actorType === 'CUSTOMER'
        ? await this.prisma.customer.findUnique({ where: { id: session.actorId } })
        : null;

    if (!customer?.isActive) {
      throw new UnauthorizedException(authError('UNAUTHENTICATED', 'Sign in required'));
    }
    req.customer = customer;
    req.sessionToken = token;
    return true;
  }
}

export const CurrentCustomer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<CustomerRequest>().customer,
);

export const SessionToken = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<CustomerRequest>().sessionToken,
);
