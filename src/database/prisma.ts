import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Reuse a single PrismaClient instance (important with `tsx watch` / hot
// reload in development, where re-creating the client on every reload would
// exhaust Postgres connections).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.nodeEnv !== 'production') {
  global.__prisma = prisma;
}
