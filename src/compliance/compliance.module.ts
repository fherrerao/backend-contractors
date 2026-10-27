import { Global, Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service.js';
import { DashboardController } from './dashboard.controller.js';
import { ExpirationJob } from './expiration.job.js';

@Global()
@Module({
  controllers: [DashboardController],
  providers: [ComplianceService, ExpirationJob],
  exports: [ComplianceService],
})
export class ComplianceModule {}
