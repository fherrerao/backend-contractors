import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { CreateRequirementDto, UpdateRequirementDto } from './dto/requirement.dto.js';
import { RequirementsService } from './requirements.service.js';

@Controller()
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Get('contractors/:contractorId/requirements')
  findByContractor(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
  ) {
    return this.requirements.findByContractor(user, contractorId);
  }

  @Post('contractors/:contractorId/requirements')
  @Roles('ADMIN', 'APPROVER')
  create(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
    @Body() dto: CreateRequirementDto,
  ) {
    return this.requirements.create(user, contractorId, dto);
  }

  @Patch('contractors/:contractorId/requirements/:id')
  @Roles('ADMIN', 'APPROVER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequirementDto,
  ) {
    return this.requirements.update(user, contractorId, id, dto);
  }
}
