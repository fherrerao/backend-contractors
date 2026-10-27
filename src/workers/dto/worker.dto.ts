import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateWorkerDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(3)
  documentId: string;

  @IsString()
  @MinLength(2)
  position: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalido' })
  email?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Debes asignar al menos un proyecto' })
  @IsUUID('all', { each: true })
  projectIds: string[];
}

export class UpdateWorkerDto extends PartialType(CreateWorkerDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Debes asignar al menos un proyecto' })
  @IsUUID('all', { each: true })
  projectIds?: string[];
}
