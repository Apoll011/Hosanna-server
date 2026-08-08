import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../database/prisma";
import { RefreshTokenRepository } from "../repositories/refreshToken.repository";
import { AppError } from "../utils/errors";
import { hashPassword, verifyPassword } from "../utils/password";
import {
  AdminJwtPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens";
import { syncCache } from "./syncCache.service";

/** Maximum consecutive failed login attempts before lockout. */
const MAX_FAILED_ATTEMPTS = 3;
/** Lockout duration in milliseconds (1 hour). */
const LOCKOUT_DURATION_MS = 60 * 60 * 1000;

function refreshExpiryDate(): Date {
  const match = /^(\d+)([smhd])$/.exec(env.jwt.refreshExpiresIn);
  const amount = match ? parseInt(match[1], 10) : 7;
  const unit = match ? match[2] : "d";
  const ms =
    { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 86_400_000;
  return new Date(Date.now() + amount * ms);
}

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  private refreshTokenRepo = new RefreshTokenRepository(prisma);

  async registerAdmin(input: {
    email: string;
    password: string;
    name: string;
    tenantSlug?: string;
    tenantId?: string;
  }) {
    let resolvedTenantId = input.tenantId;

    if (!resolvedTenantId && input.tenantSlug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: input.tenantSlug },
      });
      if (!tenant)
        throw AppError.badRequest("Tenant with provided slug does not exist.");
      resolvedTenantId = tenant.id;
    }

    if (!resolvedTenantId) {
      throw AppError.badRequest(
        "Must provide either tenantId or tenantSlug to register.",
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: resolvedTenantId },
    });
    if (!tenant) throw AppError.badRequest("Tenant does not exist.");

    const existing = await prisma.admin.findUnique({
      where: { email: input.email },
    });
    if (existing)
      throw AppError.badRequest("An account with this email already exists.");

    const passwordHash = await hashPassword(input.password);
    const admin = await prisma.admin.create({
      data: {
        tenantId: resolvedTenantId,
        email: input.email,
        passwordHash,
        name: input.name,
        role: "admin",
        isApproved: false, // Requires approval from an approved tenant admin before login
      },
    });

    return {
      message:
        "Registration successful. Your account is pending approval by a tenant administrator.",
      isApproved: false,
      user: {
        id: admin.id,
        tenantId: admin.tenantId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isApproved: false,
      },
    };
  }

  async login(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email } });

    // Use a timing-safe generic message for both "not found" and "wrong password"
    // to prevent user enumeration — but we still need the record to check lockout.
    if (!admin) {
      throw AppError.unauthorized("Invalid credentials.");
    }

    // ── Lockout check ──────────────────────────────────────────────────────
    if (
      admin.loginLockedUntil &&
      admin.loginLockedUntil.getTime() > Date.now()
    ) {
      const remainingMs = admin.loginLockedUntil.getTime() - Date.now();
      const remainingMins = Math.ceil(remainingMs / 60_000);
      throw new AppError(
        429,
        "UNAUTHORIZED",
        `Account is temporarily locked due to too many failed login attempts. ` +
          `Please try again in ${remainingMins} minute${remainingMins !== 1 ? "s" : ""}.`,
      );
    }

    const passwordValid = await verifyPassword(password, admin.passwordHash);

    if (!passwordValid) {
      // Increment failed counter; lock if threshold exceeded.
      const newCount = admin.loginFailedCount + 1;
      const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;
      await prisma.admin.update({
        where: { id: admin.id },
        data: {
          loginFailedCount: newCount,
          loginLockedUntil: shouldLock
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : undefined,
        },
      });

      if (shouldLock) {
        throw new AppError(
          429,
          "UNAUTHORIZED",
          "Too many failed login attempts. Your account has been locked for 1 hour.",
        );
      }

      throw AppError.unauthorized("Invalid credentials.");
    }

    if (!admin.isApproved) {
      throw new AppError(
        403,
        "ACCOUNT_NOT_APPROVED",
        "Your account is pending approval by a tenant administrator.",
      );
    }

    // ── Successful login: reset failure counters ───────────────────────────
    if (admin.loginFailedCount > 0 || admin.loginLockedUntil) {
      await prisma.admin.update({
        where: { id: admin.id },
        data: { loginFailedCount: 0, loginLockedUntil: null },
      });
    }

    const payload: AdminJwtPayload = {
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: "admin",
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(admin.id);
    await this.refreshTokenRepo.create(
      admin.id,
      hashRefreshToken(refreshToken),
      refreshExpiryDate(),
    );

    return { user: payload, token: accessToken, accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    let decoded: { id: string };
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized("Invalid or expired refresh token.");
    }

    const stored = await this.refreshTokenRepo.findByHash(
      hashRefreshToken(refreshToken),
    );
    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw AppError.unauthorized("Refresh token has been revoked or expired.");
    }

    const admin = await prisma.admin.findUnique({ where: { id: decoded.id } });
    if (!admin) throw AppError.unauthorized("Account no longer exists.");

    if (!admin.isApproved) {
      throw new AppError(
        403,
        "ACCOUNT_NOT_APPROVED",
        "Your account is pending approval by a tenant administrator.",
      );
    }

    await this.refreshTokenRepo.revoke(stored.id);
    const newRefreshToken = signRefreshToken(admin.id);
    await this.refreshTokenRepo.create(
      admin.id,
      hashRefreshToken(newRefreshToken),
      refreshExpiryDate(),
    );

    const payload: AdminJwtPayload = {
      id: admin.id,
      tenantId: admin.tenantId,
      email: admin.email,
      name: admin.name,
      role: "admin",
    };

    const accessToken = signAccessToken(payload);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const stored = await this.refreshTokenRepo.findByHash(
      hashRefreshToken(refreshToken),
    );
    if (stored && !stored.revokedAt) {
      await this.refreshTokenRepo.revoke(stored.id);
    }
  }

  async me(adminId: string) {
    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin)
      throw AppError.notFound(
        "ADMIN_NOT_FOUND",
        "Administrator account not found.",
      );
    if (!admin.isApproved) {
      throw new AppError(
        403,
        "ACCOUNT_NOT_APPROVED",
        "Your account is pending approval by a tenant administrator.",
      );
    }
    return {
      user: {
        id: admin.id,
        tenantId: admin.tenantId,
        email: admin.email,
        logo: admin.logo,
        name: admin.name,
        role: admin.role,
        createdAt: admin.createdAt,
        isApproved: admin.isApproved,
      },
    };
  }

  /**
   * Update the authenticated admin's own profile.
   * Fields are all optional; only supplied fields are changed.
   * Password change requires `currentPassword` verification.
   */
  async updateProfile(
    adminId: string,
    input: {
      name?: string;
      email?: string;
      logo?: string | null;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin)
      throw AppError.notFound(
        "ADMIN_NOT_FOUND",
        "Administrator account not found.",
      );

    // ── Password change ────────────────────────────────────────────────────
    let passwordHash: string | undefined;
    if (input.newPassword) {
      if (!input.currentPassword) {
        throw AppError.badRequest(
          "currentPassword is required to change your password.",
        );
      }
      const valid = await verifyPassword(
        input.currentPassword,
        admin.passwordHash,
      );
      if (!valid) {
        throw AppError.unauthorized("Current password is incorrect.");
      }
      passwordHash = await hashPassword(input.newPassword);
    }

    // ── Email uniqueness check ─────────────────────────────────────────────
    if (input.email && input.email !== admin.email) {
      const conflict = await prisma.admin.findUnique({
        where: { email: input.email },
      });
      if (conflict) {
        throw AppError.badRequest("An account with that email already exists.");
      }
    }

    // ── Persist changes ────────────────────────────────────────────────────
    const updated = await prisma.admin.update({
      where: { id: adminId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.logo !== undefined ? { logo: input.logo } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    // Invalidate sync cache so admin timestamp change propagates immediately.
    syncCache.invalidate(updated.tenantId);

    return {
      user: {
        id: updated.id,
        tenantId: updated.tenantId,
        email: updated.email,
        logo: updated.logo,
        name: updated.name,
        role: updated.role,
        createdAt: updated.createdAt,
        isApproved: updated.isApproved,
      },
    };
  }
}
