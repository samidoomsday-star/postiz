import { ReviewService } from '@gitroom/nestjs-libraries/agency/review.service';
import { ApprovalService } from '@gitroom/nestjs-libraries/agency/approval.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
} from '@nestjs/common';
import { AgencyService } from '@gitroom/nestjs-libraries/agency/agency.service';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { AgencyRequest } from './agency.guard';

@Controller('agency')
export class AgencyController {
  constructor(
    private agency: AgencyService,
    private approval: ApprovalService,
    private review: ReviewService
  ) {}
  @Get('self')
  async self(@Req() req: AgencyRequest) {
    const actor = req.agencyActor;
    let admin = false;
    if (actor.type === 'user') {
      const member = await this.agency.membership(actor);
      admin = ['ADMIN', 'SUPERADMIN'].includes(member.role);
    }
    return { actor, admin, clients: await this.agency.clients(actor) };
  }
  @Get('clients') clients(@Req() r: AgencyRequest) {
    return this.agency.clients(r.agencyActor);
  }
  @Post('clients') createClient(
    @Req() r: AgencyRequest,
    @Body('name') name: string
  ) {
    return this.agency.createClient(r.agencyActor, name);
  }
  @Get('clients/:id/channels') channels(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.agency.channels(r.agencyActor, id);
  }
  @Get('clients/:id/posts') list(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Query('search') search = '',
    @Query('page') page = '0'
  ) {
    if (!/^\d+$/.test(page)) throw new BadRequestException('Invalid page');
    return this.agency.posts(r.agencyActor, id, search, Number(page));
  }
  @Get('posts/:id') get(@Req() r: AgencyRequest, @Param('id') id: string) {
    return this.agency.postView(r.agencyActor, id);
  }
  @Post('posts')
  async create(@Req() r: AgencyRequest, @Body() body: CreatePostDto) {
    return this.approval.save(r.agencyActor, body);
  }
  @Get('clients/:id/works') works(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.approval.list(r.agencyActor, id);
  }
  @Get('works/:id') work(@Req() r: AgencyRequest, @Param('id') id: string) {
    return this.approval.view(r.agencyActor, id);
  }
  @Get('clients/:id/reviewers') reviewers(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.approval.reviewers(r.agencyActor, id);
  }
  @Get('reviews') reviews(@Req() r: AgencyRequest) {
    return this.approval.reviews(r.agencyActor);
  }
  @Post('works/:id/revisions') editRevision(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body()
    body: CreatePostDto & { expectedRevision: number; operationId: string }
  ) {
    return this.approval.save(r.agencyActor, body, id, {
      expectedRevision: body.expectedRevision,
      operationId: body.operationId,
    });
  }
  @Post('works/:id/submit') submit(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.submit(r.agencyActor, id, body);
  }
  @Post('works/:id/approve') approve(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.decide(r.agencyActor, id, body, 'APPROVED');
  }
  @Post('works/:id/changes') changes(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.decide(r.agencyActor, id, body, 'CHANGES_REQUESTED');
  }
  @Post('works/:id/revoke') revoke(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.revoke(r.agencyActor, id, body);
  }
  @Post('works/:id/cancel') cancel(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.revoke(r.agencyActor, id, body, true);
  }
  @Post('works/:id/schedule') schedule(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ApprovalService['submit']>[2]
  ) {
    return this.approval.schedule(r.agencyActor, id, body);
  }
  private bytes(
    response: Response,
    value: { bytes: Buffer; mime: string },
    range?: string
  ) {
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': value.mime,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Accept-Ranges': 'bytes',
    });
    const match = /^bytes=(\d+)-(\d*)$/.exec(range || '');
    if (!match) return new StreamableFile(value.bytes);
    const start = +match[1];
    const end = match[2]
      ? Math.min(+match[2], value.bytes.length - 1)
      : value.bytes.length - 1;
    if (start > end || start >= value.bytes.length) {
      response.status(416);
      response.set('Content-Range', `bytes */${value.bytes.length}`);
      return new StreamableFile(Buffer.alloc(0));
    }
    response.status(206);
    response.set(
      'Content-Range',
      `bytes ${start}-${end}/${value.bytes.length}`
    );
    return new StreamableFile(value.bytes.subarray(start, end + 1));
  }
  @Get('revisions/:revisionId/media/:id') async preview(
    @Req() r: AgencyRequest,
    @Param('revisionId') revisionId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.bytes(
      response,
      await this.approval.snapshot(r.agencyActor, revisionId, id),
      r.headers.range
    );
  }
  @Get('assets/:id') async asset(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Query('cap') cap: string,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.bytes(
      response,
      await this.approval.asset(id, cap),
      r.headers.range
    );
  }
  @Post('clients/:id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    })
  )
  upload(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body('alt') alt?: string
  ) {
    return this.approval.upload(r.agencyActor, id, file, alt);
  }
  @Get('management') management(@Req() r: AgencyRequest) {
    return this.agency.management(r.agencyActor);
  }
  @Post('grants') grant(
    @Req() r: AgencyRequest,
    @Body() body: Parameters<AgencyService['grant']>[1]
  ) {
    return this.agency.grant(r.agencyActor, body);
  }
  @Post('grants/:id/revoke') revokeGrant(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.agency.revokeGrant(r.agencyActor, id);
  }
  @Post('credentials') credential(
    @Req() r: AgencyRequest,
    @Body() body: Parameters<AgencyService['createCredential']>[1]
  ) {
    return this.agency.createCredential(r.agencyActor, body);
  }
  @Post('credentials/:id/revoke') revokeKey(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.agency.revokeCredential(r.agencyActor, id);
  }
  @Post('channels/:id/assign') assignChannel(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body('clientId') clientId: string
  ) {
    return this.agency.assignChannel(r.agencyActor, id, clientId);
  }
  @Get('media/:id') async media(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    const m = await this.agency.media(r.agencyActor, id);
    return {
      id: m.id,
      name: m.name,
      path: m.path,
      clientId: m.clientId,
      status: m.status,
    };
  }
  @Get('media-access') mediaAccess(
    @Req() r: AgencyRequest,
    @Query('path') path: string
  ) {
    if (
      !path ||
      path.includes('..') ||
      path.startsWith('/') ||
      path.includes('\\')
    )
      throw new BadRequestException('Invalid media path');
    return this.agency.mediaPath(r.agencyActor, path);
  }
  @Post('media/:id/map') mapMedia(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body('clientId') clientId: string
  ) {
    return this.agency.mapMedia(r.agencyActor, id, clientId);
  }
  @Post('posts/:id/map') mapPost(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body('clientId') clientId: string
  ) {
    return this.agency.mapPost(r.agencyActor, id, clientId);
  }
  @Get('clients/:id/review-invitations') invitations(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.review.invitations(r.agencyActor, id);
  }
  @Post('review-invitations') invite(
    @Req() r: AgencyRequest,
    @Body() body: Parameters<ReviewService['invite']>[1]
  ) {
    return this.review.invite(r.agencyActor, body);
  }
  @Post('review-invitations/:id/revoke') revokeInvitation(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.review.revokeInvitation(r.agencyActor, id);
  }
  @Get('works/:id/review-comments') reviewComments(
    @Req() r: AgencyRequest,
    @Param('id') id: string
  ) {
    return this.review.staffHistory(r.agencyActor, id);
  }
  @Post('works/:id/review-comments') addReviewComment(
    @Req() r: AgencyRequest,
    @Param('id') id: string,
    @Body() body: Parameters<ReviewService['comment']>[2]
  ) {
    return this.review.comment(r.agencyActor, id, body);
  }
}
