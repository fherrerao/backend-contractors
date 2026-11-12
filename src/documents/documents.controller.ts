import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { AddWorkerDocumentDto } from './dto/add-worker-document.dto.js';
import { UploadDocumentDto } from './dto/upload-document.dto.js';

@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('workers/:workerId/documents')
  findByWorker(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.documents.findByWorker(user, workerId);
  }

  @Post('workers/:workerId/documents')
  @Roles('CONTRACTOR_USER', 'ADMIN')
  addToWorker(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: AddWorkerDocumentDto,
  ) {
    return this.documents.addToWorker(user, workerId, dto);
  }

  @Delete('workers/:workerId/documents/:documentId')
  @Roles('CONTRACTOR_USER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFromWorker(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.removeFromWorker(user, workerId, documentId);
  }

  @Post('workers/:workerId/documents/:documentId/file')
  @Roles('CONTRACTOR_USER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @UploadedFile() file: UploadedFileData | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(user, workerId, documentId, file, dto);
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
