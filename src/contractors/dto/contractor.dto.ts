import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ContractorStatus } from '../../generated/prisma/enums.js';

export class CreateContractorDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(3)
  taxId: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalido' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}

export class UpdateContractorDto extends PartialType(CreateContractorDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ContractorQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ContractorStatus)
  status?: ContractorStatus;
}
