import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard, SessionToken } from './customer-auth.guard.js';
import { SessionService } from './session.service.js';

/** Signed-in devices and sign-in history for the account (§3.1 login/device history). */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionService) {}

  @Get()
  list(@CurrentCustomer() c: Customer, @SessionToken() token: string) {
    return this.sessions.list('CUSTOMER', c.id, token);
  }

  /** Sign out every other device. */
  @Post('revoke-others')
  async revokeOthers(@CurrentCustomer() c: Customer, @SessionToken() token: string) {
    return { revoked: await this.sessions.revokeFor('CUSTOMER', c.id, token) };
  }

  /** Sign out one device (not the current one — use logout for that). */
  @Delete(':id')
  @HttpCode(204)
  async revoke(@CurrentCustomer() c: Customer, @SessionToken() token: string, @Param('id', new ParseUUIDPipe({ version: '7' })) id: string) {
    await this.sessions.revokeFor('CUSTOMER', c.id, token, id);
  }
}
