import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/document.dto.js';
import { DocumentsService, type UploadedFileData } from './documents.service.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('projects/:projectId/documents')
  findByProject(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.documents.findByProject(user, projectId);
  }

  @Post('projects/:projectId/documents')
  @Roles('ADMIN', 'APPROVER')
  create(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateDocumentDto,
  ) {
    return this.documents.create(user, projectId, dto);
  }

  @Patch('documents/:id')
  @Roles('ADMIN', 'APPROVER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documents.update(user, id, dto);
  }

  @Post('projects/:projectId/documents/:documentId/file')
  @Roles('CONTRACTOR_USER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(user, projectId, documentId, file, dto);
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
