import { Router } from 'express';
import { authService } from '../services/auth.service';
import { authenticateAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { loginSchema, refreshSchema } from '../validators/auth.validators';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  }),
);

// POST /api/auth/refresh
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  }),
);

// GET /api/auth/me
authRouter.get(
  '/me',
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const result = await authService.me(req.actor && req.actor.type === 'admin' ? req.actor.admin.id : '');
    res.json(result);
  }),
);

// POST /api/auth/logout
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.body?.refreshToken);
    res.json({ message: 'Logged out successfully' });
  }),
);
