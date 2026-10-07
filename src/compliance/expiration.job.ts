import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ComplianceService } from './compliance.service.js';

@Injectable()
export class ExpirationJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpirationJob.name);

  constructor(private readonly compliance: ComplianceService) {}

  onApplicationBootstrap() {
    void this.run();
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async run() {
    try {
      const count = await this.compliance.expireDocuments();
      if (count) this.logger.log(`${count} documento(s) marcados como vencidos`);
    } catch (error) {
      this.logger.error('Error al procesar vencimientos', error as Error);
    }
  }
}
