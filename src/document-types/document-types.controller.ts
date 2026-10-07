import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators.js';
import { DocumentTypesService } from './document-types.service.js';
import { CreateDocumentTypeDto, UpdateDocumentTypeDto } from './dto/document-type.dto.js';

@Controller('document-types')
export class DocumentTypesController {
  constructor(private readonly types: DocumentTypesService) {}

  @Get()
  findAll(@Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean) {
    return this.types.findAll(!!includeInactive);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateDocumentTypeDto) {
    return this.types.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentTypeDto) {
    return this.types.update(id, dto);
  }
}
