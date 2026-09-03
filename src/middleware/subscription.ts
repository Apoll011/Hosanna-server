import type { NextFunction, Request, Response } from "express";
import { prisma } from "../database/prisma.js";
import { DEFAULT_LOCALE, t } from "../lib/i18n.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";

/**
 * HTTP methods that never mutate tenant data and are therefore always allowed,
 * even when the organization has no active subscription / trial.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A subscription entitles the organization to write access while it is:
 *  - `active`   — paid subscription in its current billing period; or
 *  - `trialing` — free trial still running (`trialEnd` in the future).
 *
 * Any other status (`incomplete`, `past_due`, `canceled`, ...) or the absence
 * of a subscription row means the organization is read-only.
 */
export function isEntitledSubscription(sub: {
  status: string;
  trialEnd?: Date | null;
}): boolean {
  if (sub.status === "active") return true;
  if (sub.status !== "trialing") return false;
  return !sub.trialEnd || sub.trialEnd.getTime() > Date.now();
}

// ── Short-lived subscription cache ─────────────────────────────────────────
// Avoids a DB round-trip on every write request. TTL is intentionally short
// (30 s) so a newly-activated subscription is recognised quickly.
const SUB_CACHE_TTL_MS = 30_000;
interface CacheEntry {
  result: boolean;
  expiresAt: number;
}
const subCache = new Map<string, CacheEntry>();

/** True when the organization has an active subscription or is on a trial. */
export async function hasActiveSubscription(
  organizationId: string,
): Promise<boolean> {
  const now = Date.now();
  const cached = subCache.get(organizationId);
  if (cached && cached.expiresAt > now) return cached.result;

  const subscriptions = await prisma.subscription.findMany({
    where: { referenceId: organizationId },
    select: { status: true, trialEnd: true },
  });
  const result = subscriptions.some(isEntitledSubscription);

  // Evict stale entries to prevent unbounded growth.
  if (subCache.size > 1024) {
    for (const [key, entry] of subCache) {
      if (entry.expiresAt <= now) subCache.delete(key);
    }
  }

  subCache.set(organizationId, { result, expiresAt: now + SUB_CACHE_TTL_MS });
  return result;
}

/**
 * Read-only gate for organizations without an active subscription or trial.
 *
 * - GET / HEAD / OPTIONS always pass (reads).
 * - Any other method is refused with a 403 `SUBSCRIPTION_REQUIRED` error whose
 *   message is translated with `req.locale`.
 *
 * Mount AFTER `authenticate` on the routers that mutate tenant data
 * (songs, folders, services, cifra, backup, replication push). Routers that
 * must stay fully accessible — trash, annotation, notifications — are mounted
 * without it.
 */
export const requireSubscription = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const locale = req.locale ?? DEFAULT_LOCALE;

    if (!req.orgId) {
      throw AppError.forbidden(t(locale, "error.workspace_required"));
    }

    if (await hasActiveSubscription(req.orgId)) return next();

    throw AppError.subscriptionRequired(
      t(locale, "error.subscription_required"),
    );
  },
);
