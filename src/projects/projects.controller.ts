import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { AssignWorkerDto } from './dto/assign-worker.dto.js';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('contractors/:contractorId/projects')
  findByContractor(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
  ) {
    return this.projects.findByContractor(user, contractorId);
  }

  @Post('contractors/:contractorId/projects')
  @Roles('ADMIN', 'APPROVER')
  create(
    @CurrentUser() user: AuthUser,
    @Param('contractorId', ParseUUIDPipe) contractorId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(user, contractorId, dto);
  }

  @Get('projects/:id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(user, id);
  }

  @Patch('projects/:id')
  @Roles('ADMIN', 'APPROVER')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user, id, dto);
  }

  @Post('projects/:id/workers/:workerId')
  @Roles('ADMIN', 'APPROVER')
  assignWorker(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() _dto: AssignWorkerDto,
  ) {
    return this.projects.assignWorker(user, id, workerId);
  }

  @Delete('projects/:id/workers/:workerId')
  @Roles('ADMIN', 'APPROVER')
  unassignWorker(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.projects.unassignWorker(user, id, workerId);
  }
}
