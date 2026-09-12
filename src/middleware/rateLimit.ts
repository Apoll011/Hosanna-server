import rateLimit from "express-rate-limit";

export const healthLimiter = rateLimit({
  windowMs: 60_000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

export const syncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600, // Generous limit for high-frequency RxDB sync polling
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as any).user?.id || (req as any).orgId || req.ip || "unknown",
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as any).user?.id || (req as any).orgId || req.ip || "unknown",
});

export const backupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
