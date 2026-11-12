import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRequirementDto {
  @IsString()
  @MinLength(2)
  name: string;
}

export class UpdateRequirementDto extends PartialType(CreateRequirementDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
