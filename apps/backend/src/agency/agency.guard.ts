import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { AgencyService } from '@gitroom/nestjs-libraries/agency/agency.service';
import { AgencyActor } from '@gitroom/nestjs-libraries/agency/policy';
import { PrismaService } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

export type AgencyRequest = Request & { agencyActor: AgencyActor };
@Injectable()
export class AgencyBoundaryGuard implements CanActivate {
  constructor(private agency: AgencyService, private db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AgencyRequest>();
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    if (
      controller === 'AuthController' &&
      ['login', 'canRegister'].includes(handler)
    ) {
      if (
        handler === 'login' &&
        (request.body?.provider !== 'LOCAL' || request.cookies?.org)
      ) {
        throw new ForbiddenException(
          'Legacy social login and invitation-cookie joining are disabled'
        );
      }
      return true;
    }
    if (controller === 'RootController') return true;
    if (controller === 'AgencyController' && handler === 'asset' && request.method === 'GET') return true;
    // Deny by controller identity, not user-controlled string prefixes. All new
    // methods in legacy controllers remain closed until deliberately adapted.
    if (
      controller !== 'AgencyController' &&
      !(controller === 'UsersController' && handler === 'getSelf')
    ) {
      throw new ForbiddenException(
        'This surface has not been enabled for client-scoped access'
      );
    }
    if (
      request.headers.impersonate ||
      request.cookies?.impersonate ||
      request.headers['x-postiz-org']
    ) {
      throw new ForbiddenException(
        'Agency impersonation and organization overrides are disabled'
      );
    }
    const authorization = request.headers.authorization;
    if (authorization !== undefined) {
      const secret = authorization.replace(/^Bearer /i, '');
      request.agencyActor = await this.agency.authenticateCredential(secret);
      if (controller !== 'AgencyController')
        throw new ForbiddenException('Scoped API only');
      return true;
    }
    const token = request.headers.auth || request.cookies?.auth;
    let userId: string;
    try {
      const payload = AuthService.verifyJWT(token) as { id?: string };
      if (!payload?.id) throw new Error('missing user');
      userId = payload.id;
    } catch {
      throw new UnauthorizedException('Sign in required');
    }
    const selected = request.headers.showorg || request.cookies?.showorg;
    if (selected && typeof selected !== 'string')
      throw new UnauthorizedException('Invalid organization');
    const member = await this.db.userOrganization.findFirst({
      where: {
        userId,
        disabled: false,
        ...(selected ? { organizationId: selected } : {}),
      },
      orderBy: { id: 'asc' },
    });
    if (!member) throw new UnauthorizedException('Inactive membership');
    request.agencyActor = {
      type: 'user',
      id: userId,
      organizationId: member.organizationId,
    };
    await this.agency.membership(request.agencyActor);
    // Cookie-authenticated mutations require a same-origin browser context.
    // Nonbrowser clients should use the scoped credential or auth header.
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !request.headers.auth
    ) {
      if (request.headers.origin !== process.env.FRONTEND_URL)
        throw new ForbiddenException('Invalid request origin');
    }
    return true;
  }
}
