import { Router } from 'express';
import { prisma } from '../database/prisma';
import { asyncHandler } from '../utils/asyncHandler';

export const healthRouter = Router();

// GET /api/health — no auth. Used by docker-compose healthchecks / load balancers.
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  }),
);
