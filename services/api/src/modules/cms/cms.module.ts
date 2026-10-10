import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminCmsController, CmsController } from './cms.controller.js';
import { CmsService } from './cms.service.js';

/** CMS pages (About, Terms, Privacy, FAQ) and platform settings (§2.11). */
@Module({
  imports: [AuthModule],
  controllers: [CmsController, AdminCmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
