import { createParamDecorator, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Shop } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomerAuthGuard, type CustomerRequest } from './customer-auth.guard.js';
import { SessionService } from './session.service.js';

export interface ShopOwnerRequest extends CustomerRequest {
  shop: Shop;
}

/**
 * Seller Center endpoints: a signed-in customer who owns a shop (shops have no
 * credentials of their own). Suspended shops are locked out of shop tools.
 */
@Injectable()
export class ShopOwnerGuard extends CustomerAuthGuard {
  constructor(
    sessions: SessionService,
    private readonly db: PrismaService,
  ) {
    super(sessions, db);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest<ShopOwnerRequest>();
    const shop = await this.db.shop.findUnique({ where: { ownerId: req.customer.id } });
    if (!shop) throw new ForbiddenException({ code: 'NO_SHOP', message: 'This account has no shop' });
    if (shop.status === 'SUSPENDED') {
      throw new ForbiddenException({ code: 'SHOP_SUSPENDED', message: 'This shop is suspended' });
    }
    req.shop = shop;
    return true;
  }
}

export const CurrentShop = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<ShopOwnerRequest>().shop,
);
