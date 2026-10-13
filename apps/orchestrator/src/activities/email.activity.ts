import { syntheticModeEnabled } from '@gitroom/helpers/testing/synthetic-mode';
import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';

@Injectable()
@Activity()
export class EmailActivity {
  constructor(
    private _emailService: EmailService,
    private _organizationService: OrganizationService
  ) {}

  @ActivityMethod()
  async sendEmail(to: string, subject: string, html: string, replyTo?: string) {
    if (!syntheticModeEnabled()) throw new Error('Legacy mail automation lacks a client audience');
    return this._emailService.sendEmailSync(to, subject, html, replyTo);
  }

  @ActivityMethod()
  async sendEmailAsync(to: string, subject: string, html: string, sendTo: 'top' | 'bottom', replyTo?: string) {
    if (!syntheticModeEnabled()) throw new Error('Legacy mail automation lacks a client audience');
    return await this._emailService.sendEmail(to, subject, html, sendTo, replyTo);
  }

  @ActivityMethod()
  async getUserOrgs(id: string) {
    const org = await this._organizationService.getTeam(id);
    return { ...org, users: [] }; // No organization-wide content audience.
  }

  @ActivityMethod()
  async setStreak(organizationId: string, type: 'start' | 'end') {
    return this._organizationService.setStreak(organizationId, type);
  }

  @ActivityMethod()
  async getLastPublishDate(organizationId: string) {
    return this._organizationService.getLastPublishDate(organizationId);
  }
}
