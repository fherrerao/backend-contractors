import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { ContractorsService } from './contractors.service.js';
import {
  ContractorQueryDto,
  CreateContractorDto,
  UpdateContractorDto,
} from './dto/contractor.dto.js';

@Controller('contractors')
export class ContractorsController {
  constructor(private readonly contractors: ContractorsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ContractorQueryDto) {
    return this.contractors.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.contractors.findOne(user, id);
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() dto: CreateContractorDto) {
    return this.contractors.create(dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContractorDto) {
    return this.contractors.update(id, dto);
  }
}
