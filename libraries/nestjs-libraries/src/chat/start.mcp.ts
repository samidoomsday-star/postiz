import { INestApplication } from '@nestjs/common';
import { Request, Response } from 'express';

export const startMcp = async (app: INestApplication) => {
  // Standalone Express transports do not pass Nest's global guard. Legacy MCP
  // keys and widgets are organization-wide; deny them before registering tools.
  app.use(['/mcp', '/sse', '/message', '/messages', '/.well-known'], (_req: Request, res: Response) => {
    res.status(403).json({ message: 'MCP is disabled until client-scoped transport is available' });
  });
};
