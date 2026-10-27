import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import { ReviewDocumentDto } from './dto/review.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller()
@Roles('APPROVER', 'ADMIN')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reviews/pending')
  pending() {
    return this.reviews.findPending();
  }

  @Get('reviews/pending/count')
  pendingCount() {
    return this.reviews.countPending();
  }

  @Post('documents/:id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.reviews.review(user, id, dto);
  }
}
