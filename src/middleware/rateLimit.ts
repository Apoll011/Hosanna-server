// Vercel's Node builder resolves this package's CommonJS entry. A default
// import there is the module namespace (TS2349). The named export is the
// middleware function in both the CJS and ESM type entries.
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

function makeKeyGenerator() {
  return (req: any) =>
    req.user?.id || req.orgId || ipKeyGenerator(req) || "unknown";
}

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
  keyGenerator: makeKeyGenerator(),
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: makeKeyGenerator(),
});

export const backupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
