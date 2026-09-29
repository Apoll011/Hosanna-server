import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmetImport from "helmet";
import { env } from "./config/env.js";

/**
 * Helmet ships separate CJS and ESM typings, and its package `types` field
 * points at the CJS file. Compilers that resolve that file (Vercel's does)
 * type `import helmet from "helmet"` as the module namespace, so `helmet()`
 * is rejected with TS2349. Node loads the ESM build, whose default export is
 * the middleware function — this cast matches that runtime value.
 */
const helmet = helmetImport as unknown as (options?: {
  crossOriginResourcePolicy?:
    | { policy?: "same-origin" | "same-site" | "cross-origin" }
    | false;
  hsts?:
    | { maxAge: number; includeSubDomains?: boolean; preload?: boolean }
    | false;
  noSniff?: boolean;
  frameguard?: { action?: "deny" | "sameorigin" } | false;
  xssFilter?: boolean;
  hidePoweredBy?: boolean;
}) => RequestHandler;
import { auth } from "./lib/auth.js";
import { DEFAULT_LOCALE, t } from "./lib/i18n.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

/** True when running as a Vercel Function (Fluid / serverless). */
const isVercel = Boolean(process.env.VERCEL);

const app = express();

app.disable("x-powered-by");
app.disable("etag");
app.set("trust proxy", 1);

// ── HTTPS redirect — only for long-running hosts (Docker / bare metal) ─────
// Vercel terminates TLS at the edge; redirecting here wastes cold-start CPU
// and can fight the platform's own HTTPS enforcement.
if (env.nodeEnv === "production" && !isVercel) {
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(301, `https://${req.header("host")}${req.url}`);
    }
    next();
  });
}

// ── Security headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts:
      env.nodeEnv === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    noSniff: true,
    frameguard: { action: "deny" },
    xssFilter: true,
    hidePoweredBy: true,
  }),
);

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost",
      "hosanna://localhost",
      "https://studio.hosanna.live",
      "https://dev-studio.hosanna.live",
      "https://hosanna.live",
    ],
    credentials: true,
    exposedHeaders: ["set-auth-token"],
  }),
);

// ── Compression — skip on Vercel (edge/CDN already compresses) ─────────────
// Lazy-load so the Vercel serverless bundle does not pay for the middleware
// on every cold start.
if (!isVercel) {
  const { default: compression } = await import("compression");
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    }),
  );
}

app.all("/api/auth/*", toNodeHandler(auth));

// ── Body parsing ─────────────────────────────────────────────────────────────
// 5 MB headroom for large replication push batches (songs with full lyrics)
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── Cache-Control — private APIs must not be cached by shared proxies ───────
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// ── Default locale ──────────────────────────────────────────────────────────
// Ensures req.locale is always defined. The authenticate middleware overwrites
// this with the org-specific locale for authenticated routes.
app.use((req, _res, next) => {
  if (!req.locale) req.locale = DEFAULT_LOCALE;
  next();
});

// ── Global rate limiter ─────────────────────────────────────────────────────
// Note: in-memory store is per-instance. Fine for Docker; on Vercel Fluid it
// only rate-limits within a warm isolate (still useful as a safety net).
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: t(DEFAULT_LOCALE, "error.rate_limit_exceeded"),
    },
  },
  skip: () => env.nodeEnv !== "production",
});

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api", globalLimiter, apiRouter);

// ── Error handling ──────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// Vercel Fluid / Express detection: export the app (do not listen).
export default app;

/** Allow long replication pushes / cron work on Vercel Pro+. */
export const config = {
  maxDuration: 60,
};

// ── Long-running server (local + Docker) ───────────────────────────────────
if (!isVercel) {
  const server = app.listen(env.port, "0.0.0.0", () => {
    console.log(
      `Hosanna API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`,
    );
  });

  // Keep idle keep-alive connections alive for 65 s (slightly above typical
  // load-balancer 60 s timeout to avoid race-condition RST packets).
  server.keepAliveTimeout = 65_000;
  // Give headers an extra 5 s on top of keep-alive to arrive fully.
  server.headersTimeout = 70_000;
}
