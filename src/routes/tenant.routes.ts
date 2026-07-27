import { Router } from 'express';
import { TenantService } from '../services/tenant.service';
import { asyncHandler } from '../utils/asyncHandler';

export const tenantRouter = Router();

// POST /api/tenants/register
tenantRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const tenantService = new TenantService();
    const tenant = await tenantService.register(req.body);
    res.status(201).json(tenant);
  }),
);
