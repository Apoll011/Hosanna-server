import { Router } from "express";
import { authenticateAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AuthService } from "../services/auth.service";
import { asyncHandler } from "../utils/asyncHandler";
import {
  loginSchema,
  refreshSchema,
  registerAdminSchema,
  updateProfileSchema,
} from "../validators/auth.validators";

export const authRouter = Router();

// POST /api/auth/register — register a new admin user into an existing tenant by tenantSlug or tenantId
authRouter.post(
  "/register",
  validate({ body: registerAdminSchema }),
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    const result = await authService.registerAdmin(req.body);
    res.status(201).json(result);
  }),
);

// POST /api/auth/login
authRouter.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    const result = await authService.login(req.body.email, req.body.password);
    res.json(result);
  }),
);

// POST /api/auth/refresh
authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  }),
);

// GET /api/auth/me — returns the authenticated admin's profile
authRouter.get(
  "/me",
  authenticateAdmin,
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    const adminId =
      req.actor && req.actor.type === "admin" ? req.actor.admin.id : "";
    const result = await authService.me(adminId);
    res.json(result);
  }),
);

/**
 * PATCH /api/auth/me — update the authenticated admin's own profile.
 *
 * Editable fields (all optional, at least one required):
 *   - name        : display name
 *   - email       : login email (must be unique)
 *   - logo        : URL to avatar/logo image (set to null to remove)
 *   - newPassword : new password (requires currentPassword for verification)
 */
authRouter.patch(
  "/me",
  authenticateAdmin,
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    const adminId =
      req.actor && req.actor.type === "admin" ? req.actor.admin.id : "";
    const result = await authService.updateProfile(adminId, req.body);
    res.json(result);
  }),
);

// POST /api/auth/logout
authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const authService = new AuthService();
    await authService.logout(req.body?.refreshToken);
    res.json({ message: "Logged out successfully" });
  }),
);
