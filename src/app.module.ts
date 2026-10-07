import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { ContractorsModule } from './contractors/contractors.module.js';
import { DocumentTypesModule } from './document-types/document-types.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

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
    DocumentTypesModule,
    DocumentsModule,
    ReviewsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
