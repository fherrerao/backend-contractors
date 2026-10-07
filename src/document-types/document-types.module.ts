import { Module } from '@nestjs/common';
import { DocumentTypesController } from './document-types.controller.js';
import { DocumentTypesService } from './document-types.service.js';

@Module({
  controllers: [DocumentTypesController],
  providers: [DocumentTypesService],
})
export class DocumentTypesModule {}
