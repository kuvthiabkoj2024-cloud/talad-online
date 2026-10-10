import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Admin audit log (§2.1). Global so every admin feature can record its changes. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
