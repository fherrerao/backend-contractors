import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller.js';
import { ContractorsService } from './contractors.service.js';

@Module({
  controllers: [ContractorsController],
  providers: [ContractorsService],
})
export class ContractorsModule {}
