import { IsDateString, IsOptional } from 'class-validator';

export class UploadDocumentDto {
  @IsOptional()
  @IsDateString({}, { message: 'Fecha de vencimiento invalida' })
  expiresAt?: string;
}
