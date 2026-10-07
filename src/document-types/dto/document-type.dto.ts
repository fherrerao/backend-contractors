import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDocumentTypeDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  expires?: boolean;
}

export class UpdateDocumentTypeDto extends PartialType(CreateDocumentTypeDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
