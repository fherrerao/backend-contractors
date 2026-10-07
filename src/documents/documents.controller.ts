import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { DocumentsService, type UploadedFileData } from './documents.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('contractors/:contractorId/documents')
  findByContractor(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
  ) {
    return this.documents.findByContractor(user, contractorId);
  }

  @Post('contractors/:contractorId/documents/:typeId')
  @Roles('CONTRACTOR_USER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
    @Param('typeId', ParseUUIDPipe) typeId: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(user, contractorId, typeId, file, dto);
  }

  @Get('documents/:id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const { stream, fileName, mimeType } = await this.documents.getFile(user, id);
    return new StreamableFile(stream, {
      type: mimeType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }

  @Get('documents/:id/reviews')
  reviews(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.getReviews(user, id);
  }
}
