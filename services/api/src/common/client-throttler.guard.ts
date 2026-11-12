import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { clientIp, fromInternalServer } from './client-ip.js';

/**
 * Rate limits per visitor, also when the storefront's server calls for them (see client-ip).
 * Our server's own calls for no visitor (cached public pages) aren't limited: otherwise they'd
 * all share one budget.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request | undefined>();
    if (req?.headers && fromInternalServer(req) && !clientIp(req)) return true;
    return super.shouldSkip(context);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req as Request) ?? (await super.getTracker(req));
  }
}
