import rateLimit from "express-rate-limit";

export const healthLimiter = rateLimit({ windowMs: 60_000, limit: 1000 });

export const syncLimiter = rateLimit({ windowMs: 60_000, limit: 60 });

export const apiLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 500 });
export const backupLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10 });
