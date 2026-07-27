import { Router } from 'express';
import { TenantService } from '../services/tenant.service';
import { authenticateAdmin, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { createAdminUserSchema } from '../validators/auth.validators';
import { prisma } from '../database/prisma';
import { hashPassword } from '../utils/password';
import { AppError } from '../utils/errors';

export const tenantRouter = Router();

// POST /api/tenants/register — create a brand new tenant with an initial admin
tenantRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const tenantService = new TenantService();
    const tenant = await tenantService.register(req.body);
    res.status(201).json(tenant);
  }),
);

// POST /api/tenants/admins — admin only: register/add a new admin user into the current tenant context
tenantRouter.post(
  '/admins',
  authenticateAdmin,
  requireAdmin,
  validate({ body: createAdminUserSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = req.body;
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) throw AppError.badRequest('An account with this email already exists.');

    const passwordHash = await hashPassword(password);
    const admin = await req.db!.admin.create({
      data: {
        email,
        passwordHash,
        name,
        role: role ?? 'admin',
      } as any,
    });

    res.status(201).json({
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      createdAt: admin.createdAt,
    });
  }),
);
