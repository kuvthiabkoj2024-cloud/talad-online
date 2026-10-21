import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuditController, AdminAuthController, AdminUsersController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

/** Admin staff accounts, roles and permissions (§2.1 RBAC). */
@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminUsersController, AdminAuditController],
  providers: [AdminAuthService],
})
export class AdminsModule {}
