import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
@Injectable()
export class PublicAuthMiddleware implements NestMiddleware {
  use(_req: Request, res: Response) {
    res.status(401).json({ message: 'Legacy organization credentials are disabled. Use scoped /agency endpoints.' });
  }
}
