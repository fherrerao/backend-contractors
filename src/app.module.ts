import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { ContractorsModule } from './contractors/contractors.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    ComplianceModule,
    AuthModule,
    UsersModule,
    ContractorsModule,
    ProjectsModule,
    WorkersModule,
    DocumentsModule,
    ReviewsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

