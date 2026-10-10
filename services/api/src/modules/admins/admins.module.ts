import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuthController, AdminUsersController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

/** Admin staff accounts and RBAC roles: Super Admin, Support, Finance (§2.1). */
@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminUsersController],
  providers: [AdminAuthService],
})
export class AdminsModule {}
