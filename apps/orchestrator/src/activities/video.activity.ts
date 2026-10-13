import { BadRequestException } from '@nestjs/common';
import { HttpException, Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { VideoDto } from '@gitroom/nestjs-libraries/dtos/videos/video.dto';

@Injectable()
@Activity()
export class VideoActivity {
  constructor(
    private _mediaService: MediaService,
    private _organizationService: OrganizationService
  ) {}

  @ActivityMethod()
  async generateVideo(organizationId: string, body: VideoDto): ReturnType<MediaService['generateVideo']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }
}
