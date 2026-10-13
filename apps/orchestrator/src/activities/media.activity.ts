import { BadRequestException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { MediaService } from '@gitroom/nestjs-libraries/database/prisma/media/media.service';

@Injectable()
@Activity()
export class MediaActivity {
  constructor(private _mediaService: MediaService) {}

  // Returns the processor job id, or null when there is nothing to process
  @ActivityMethod()
  async submitMediaProcessing(mediaId: string): ReturnType<MediaService['submitProcessing']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  // Returns true once the media record is final (ready or failed)
  @ActivityMethod()
  async checkMediaProcessing(mediaId: string, jobId: string): ReturnType<MediaService['checkProcessing']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async failMediaProcessing(mediaId: string, error: string): ReturnType<MediaService['failProcessing']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }
}
