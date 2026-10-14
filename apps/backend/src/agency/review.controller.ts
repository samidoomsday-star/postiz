import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import {
  ReviewContext,
  ReviewService,
  REVIEW_COOKIE,
  REVIEW_CHALLENGE_COOKIE,
} from '@gitroom/nestjs-libraries/agency/review.service';
export type ReviewRequest = Request & { reviewContext: ReviewContext };
@Controller('agency/review')
export class ReviewController {
  constructor(private review: ReviewService) {}
  private cookieOptions(expiresAt?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure:
        new URL(process.env.NEXT_PUBLIC_BACKEND_URL!).protocol === 'https:',
      sameSite: 'strict',
      path: '/agency/review',
      ...(expiresAt ? { expires: expiresAt } : {}),
    };
  }
  private ip(req: Request) {
    return req.socket.remoteAddress || 'unknown';
  }
  @Post('challenge') async challenge(
    @Req() req: ReviewRequest,
    @Body() body: { token: string },
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.review.challenge(body?.token, this.ip(req));
    res.cookie(
      REVIEW_CHALLENGE_COOKIE,
      result.nonce,
      this.cookieOptions(result.expiresAt)
    );
    return { challengeId: result.id, expiresAt: result.expiresAt };
  }
  @Post('verify') async verify(
    @Req() req: ReviewRequest,
    @Body() body: Parameters<ReviewService['verify']>[0],
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.review.verify(
      body,
      req.cookies?.[REVIEW_CHALLENGE_COOKIE],
      this.ip(req)
    );
    res.cookie(
      REVIEW_COOKIE,
      result.secret,
      this.cookieOptions(result.session.expiresAt)
    );
    res.clearCookie(REVIEW_CHALLENGE_COOKIE, this.cookieOptions());
    const ctx = await this.review.authenticate(result.secret);
    return this.review.profile(ctx);
  }
  @Get('session') session(@Req() req: ReviewRequest) {
    return this.review.profile(req.reviewContext);
  }
  @Post('logout') async logout(
    @Req() req: ReviewRequest,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.review.logout(req.reviewContext);
    res.clearCookie(REVIEW_COOKIE, this.cookieOptions());
    return result;
  }
  @Get('works') works(
    @Req() req: ReviewRequest,
    @Query('week') week?: string,
    @Query('page') page?: string
  ) {
    return this.review.list(req.reviewContext, week, page);
  }
  @Get('works/:id') work(@Req() req: ReviewRequest, @Param('id') id: string) {
    return this.review.detail(req.reviewContext, id);
  }
  @Post('works/:id/approve') approve(
    @Req() req: ReviewRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ReviewService['decide']>[2]
  ) {
    return this.review.decide(req.reviewContext, id, body, 'APPROVED');
  }
  @Post('works/:id/changes') changes(
    @Req() req: ReviewRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ReviewService['decide']>[2]
  ) {
    return this.review.decide(req.reviewContext, id, body, 'CHANGES_REQUESTED');
  }
  @Post('works/:id/comments') comments(
    @Req() req: ReviewRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ReviewService['comment']>[2]
  ) {
    return this.review.comment(
      req.reviewContext.actor,
      id,
      body,
      req.reviewContext
    );
  }
  @Post('bulk') bulk(
    @Req() req: ReviewRequest,
    @Body() body: Parameters<ReviewService['bulk']>[1]
  ) {
    return this.review.bulk(req.reviewContext, body);
  }
  @Get('works/:id/revisions/:revisionId/media/:snapshotId') async media(
    @Req() req: ReviewRequest,
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Param('snapshotId') snapshotId: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const value = await this.review.media(
      req.reviewContext,
      id,
      revisionId,
      snapshotId
    );
    res.set({ 'Content-Type': value.mime, 'Accept-Ranges': 'bytes' });
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (!range) return new StreamableFile(value.bytes);
    const start = +range[1],
      end = range[2]
        ? Math.min(+range[2], value.bytes.length - 1)
        : value.bytes.length - 1;
    if (start > end || start >= value.bytes.length) {
      res.status(416);
      res.set('Content-Range', `bytes */${value.bytes.length}`);
      return new StreamableFile(Buffer.alloc(0));
    }
    res.status(206);
    res.set('Content-Range', `bytes ${start}-${end}/${value.bytes.length}`);
    return new StreamableFile(value.bytes.subarray(start, end + 1));
  }
}
