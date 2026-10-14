import { BadRequestException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ClippingService } from '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service';

// An activity on main can never change its parameters, so every one takes a
// single object of ids: the state lives on the clipping records, and a field
// can be added to the object without a new activity
@Injectable()
@Activity()
export class ClippingActivity {
  constructor(private _clippingService: ClippingService) {}

  @ActivityMethod()
  async submitClippingAnalyse({ clippingId }: { clippingId: string }): ReturnType<ClippingService['submitAnalyse']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async checkClippingAnalyse({
    clippingId,
    jobId,
  }: {
    clippingId: string;
    jobId: string;
  }): ReturnType<ClippingService['checkAnalyse']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async transcribeClipping({ clippingId }: { clippingId: string }): ReturnType<ClippingService['transcribe']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async pickClippingClips({ clippingId }: { clippingId: string }): ReturnType<ClippingService['pickClips']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async submitClipFetch({ clipId }: { clipId: string }): ReturnType<ClippingService['submitClipFetch']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async checkClipFetch({ clipId, jobId }: { clipId: string; jobId: string }): ReturnType<ClippingService['checkClipFetch']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async captionClip({ clipId }: { clipId: string }): ReturnType<ClippingService['captionClip']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async submitClipRender({ clipId }: { clipId: string }): ReturnType<ClippingService['submitClipRender']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async checkClipRender({ clipId, jobId }: { clipId: string; jobId: string }): ReturnType<ClippingService['checkClipRender']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  // "customer" says the error was written for the customer to read
  @ActivityMethod()
  async failClip({
    clipId,
    error,
    customer,
  }: {
    clipId: string;
    error: string;
    customer?: boolean;
  }): ReturnType<ClippingService['failClip']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async createClippingDrafts({ clippingId }: { clippingId: string }): ReturnType<ClippingService['createDrafts']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async finishClipping({ clippingId }: { clippingId: string }): ReturnType<ClippingService['finishClipping']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }

  @ActivityMethod()
  async failClipping({
    clippingId,
    error,
    customer,
  }: {
    clippingId: string;
    error: string;
    customer?: boolean;
  }): ReturnType<ClippingService['failClipping']> {
    throw new BadRequestException('Legacy media automation awaits client-scoped access');
  }
}
