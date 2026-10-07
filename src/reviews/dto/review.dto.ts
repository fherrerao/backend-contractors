import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ReviewAction } from '../../generated/prisma/enums.js';

export class ReviewDocumentDto {
  @IsEnum(ReviewAction)
  action: ReviewAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
