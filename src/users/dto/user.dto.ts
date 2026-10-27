import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums.js';

export class CreateUserDto {
  @IsEmail({}, { message: 'Email invalido' })
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6, { message: 'La contrasena debe tener al menos 6 caracteres' })
  password: string;

  @IsEnum(Role)
  role: Role;

  @ValidateIf((o: CreateUserDto) => o.role === Role.CONTRACTOR_USER)
  @IsUUID('all', { message: 'Un usuario de contratista debe tener contratista asignado' })
  contractorId?: string | null;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
