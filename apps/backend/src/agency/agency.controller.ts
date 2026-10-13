import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CreationMethod } from '@prisma/client';
import { AgencyService } from '@gitroom/nestjs-libraries/agency/agency.service';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { CreatePostDto } from '@gitroom/nestjs-libraries/dtos/posts/create.post.dto';
import { AgencyRequest } from './agency.guard';

@Controller('agency')
export class AgencyController {
  constructor(private agency: AgencyService, private posts: PostsService) {}
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
    // All targets/IDs/media must pass before provider validation or any write.
    await this.agency.validateDraft(
      r.agencyActor,
      r.agencyActor.organizationId,
      body
    );
    const validation = await this.posts.validatePosts(
      r.agencyActor.organizationId,
      body.posts
    );
    for (const item of validation) {
      if (
        item.emptyContent ||
        (body.type !== 'draft' &&
          (!item.valid || item.errors !== true || item.tooLong))
      )
        throw new BadRequestException(
          'Content or provider settings are invalid'
        );
    }
    return this.posts.createPost(
      r.agencyActor.organizationId,
      body,
      r.agencyActor.type === 'user' ? CreationMethod.WEB : CreationMethod.API,
      false,
      r.agencyActor
    );
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
}
