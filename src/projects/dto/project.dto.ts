import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProjectDocumentInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

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

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debes agregar al menos un documento' })
  @ValidateNested({ each: true })
  @Type(() => ProjectDocumentInputDto)
  documents: ProjectDocumentInputDto[];
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes agregar al menos un documento' })
  @ValidateNested({ each: true })
  @Type(() => ProjectDocumentInputDto)
  documents?: ProjectDocumentInputDto[];
}
