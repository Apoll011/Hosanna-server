import { Router } from "express";
import { prisma } from "../database/prisma";
import { authenticateAdmin, requireAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AdminRepository } from "../repositories/admin.repository";
import { TenantService } from "../services/tenant.service";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";
import { hashPassword } from "../utils/password";
import { createAdminUserSchema } from "../validators/auth.validators";
import { idParamSchema } from "../validators/common.validators";
import { editTenantSchema } from "../validators/tenant.validators";

export const tenantRouter = Router();

// POST /api/tenants/register — create a brand new tenant with an initial admin
tenantRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const tenantService = new TenantService();
    const tenant = await tenantService.register(req.body);
    res.status(201).json(tenant);
  }),
);

// GET /api/tenants/admins — admin only: list all admins in the current tenant
tenantRouter.get(
  "/admins",
  authenticateAdmin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const repo = new AdminRepository(req.db!);
    res.json(await repo.findAll());
  }),
);

// GET /api/tenants/me — admin only: Get tenant name and slug
tenantRouter.get(
  "/me",
  authenticateAdmin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const repo = new AdminRepository(req.db!);
    res.json(await repo.tenant(req.tenantId!));
  }),
);

// GET /api/tenants/admins/pending — admin only: list all pending admins in the current tenant
tenantRouter.get(
  "/admins/pending",
  authenticateAdmin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const repo = new AdminRepository(req.db!);
    res.json(await repo.findPending());
  }),
);

// POST /api/tenants/admins — admin only: register/add a new approved admin user into current tenant context
tenantRouter.post(
  "/admins",
  authenticateAdmin,
  requireAdmin,
  validate({ body: createAdminUserSchema }),
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = req.body;
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing)
      throw AppError.badRequest("An account with this email already exists.");

    const passwordHash = await hashPassword(password);
    const admin = await req.db!.admin.create({
      data: {
        email,
        passwordHash,
        name,
        role: role ?? "admin",
        isApproved: true,
      } as any,
    });

    res.status(201).json({
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isApproved: admin.isApproved,
      createdAt: admin.createdAt,
    });
  }),
);

// PUT /api/tenants/admins/:id/approve — admin only: approve a pending admin user
tenantRouter.put(
  "/admins/:id/approve",
  authenticateAdmin,
  requireAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repo = new AdminRepository(req.db!);
    const target = await repo.findById(req.params.id);
    if (!target)
      throw AppError.notFound(
        "ADMIN_NOT_FOUND",
        "Admin account not found in this tenant.",
      );

    const approved = await repo.approve(req.params.id);
    res.json({
      message: "Admin account approved successfully.",
      user: approved,
    });
  }),
);

// PUT /api/tenants/edit/ — admin only: edit tenant
tenantRouter.put(
  "/edit",
  authenticateAdmin,
  requireAdmin,
  validate({ body: editTenantSchema }),
  asyncHandler(async (req, res) => {
    const updated = await prisma.tenant.update({
      where: {
        id: req.tenantId!,
      },
      data: req.body,
    });

    res.json({
      message: "Updated Tenant",
      tenant: updated,
    });
  }),
);

// DELETE /api/tenants/admins/:id — admin only: reject or remove an admin user from tenant
tenantRouter.delete(
  "/admins/:id",
  authenticateAdmin,
  requireAdmin,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const repo = new AdminRepository(req.db!);
    const target = await repo.findById(req.params.id);
    if (!target)
      throw AppError.notFound(
        "ADMIN_NOT_FOUND",
        "Admin account not found in this tenant.",
      );

    if (req.actor?.type === "admin" && req.actor.admin.id === req.params.id) {
      throw AppError.badRequest("You cannot delete your own admin account.");
    }

    await repo.delete(req.params.id);
    res.json({ message: "Admin account removed successfully." });
  }),
);
