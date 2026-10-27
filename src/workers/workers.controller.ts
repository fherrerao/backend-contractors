import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { CreateWorkerDto, UpdateWorkerDto } from './dto/worker.dto.js';
import { WorkersService } from './workers.service.js';

@Controller()
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  @Get('contractors/:contractorId/workers')
  findByContractor(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
  ) {
    return this.workers.findByContractor(user, contractorId);
  }

  @Post('contractors/:contractorId/workers')
  @Roles('ADMIN', 'APPROVER')
  create(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
    @Body() dto: CreateWorkerDto,
  ) {
    return this.workers.create(user, contractorId, dto);
  }

  @Get('workers/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.workers.findOne(user, id);
  }

  @Patch('workers/:id')
  @Roles('ADMIN', 'APPROVER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkerDto,
  ) {
    return this.workers.update(user, id, dto);
  }
}
