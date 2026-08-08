import rateLimit from "express-rate-limit";

export const healthLimiter = rateLimit({ windowMs: 60_000, limit: 1000 });

/**
 * Auth limiter: applied to all /auth/* routes.
 * Generous enough for normal use but throttles brute-force attempts.
 */
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20 });

/**
 * Login-specific limiter: stricter than the general auth limiter.
 * 10 login attempts per 15 minutes per IP — supplements the per-account
 * lockout added in AuthService so that even distributed attacks are slowed.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message:
        "Too many login attempts from this IP. Please wait 15 minutes before trying again.",
    },
  },
});

/**
 * Sync limiter: sync/status is called frequently by clients.
 * With the in-memory cache most calls are served without hitting the DB,
 * so we can keep the window small and limit modest.
 */
export const syncLimiter = rateLimit({ windowMs: 60_000, limit: 60 });

export const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 500 });
export const backupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10 });
