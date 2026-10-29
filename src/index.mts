import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmetImport from "helmet";
import { env } from "./config/env.js";
import { auth } from "./lib/auth.js";
import { DEFAULT_LOCALE, t } from "./lib/i18n.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { mcpRouter } from "./mcp/http.js";
import { apiRouter } from "./routes/index.js";

/**
 * Vercel's Node builder typechecks Helmet's CommonJS file. That file's
 * default import is the module namespace, so `helmet()` is TS2349. Node
 * loads the ESM build, whose default export is the middleware function.
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
const corsOrigins = [
  "http://localhost:5173",
  "http://localhost",
  "http://127.0.0.1:5173",
  "hosanna://localhost",
  "https://studio.hosanna.live",
  "https://dev-studio.hosanna.live",
  "https://hosanna.live",
  // External MCP OAuth hosts (browser DCR / authorize)
  "https://claude.ai",
  "https://www.claude.ai",
  "https://chatgpt.com",
  "https://chat.openai.com",
  "https://cursor.com",
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (corsOrigins.includes(origin)) return callback(null, true);
      // Allow any *.hosanna.live / *.openai.com / *.cursor.com studio hosts
      try {
        const host = new URL(origin).hostname;
        if (
          host === "hosanna.live" ||
          host.endsWith(".hosanna.live") ||
          host === "openai.com" ||
          host.endsWith(".openai.com") ||
          host === "cursor.com" ||
          host.endsWith(".cursor.com") ||
          host.endsWith(".cursor.sh")
        ) {
          return callback(null, true);
        }
      } catch {
        /* reject */
      }
      return callback(null, false);
    },
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

const authHandler = toNodeHandler(auth);

// Better Auth owns /api/auth/* (OAuth AS, sessions, JWKS).
app.all("/api/auth/*", authHandler);

// RFC 9728 / RFC 8414 path-aware well-known documents live at the *origin*
// root (not under /api/auth). MCP clients (Claude, ChatGPT, Cursor) fetch
// these before DCR + authorize — without them OAuth never starts.
app.all("/.well-known/oauth-protected-resource", authHandler);
app.all("/.well-known/oauth-protected-resource/*", authHandler);
app.all("/.well-known/oauth-authorization-server", authHandler);
app.all("/.well-known/oauth-authorization-server/*", authHandler);
app.all("/.well-known/openid-configuration", authHandler);
app.all("/.well-known/openid-configuration/*", authHandler);

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

// ── MCP (Streamable HTTP) ───────────────────────────────────────────────────
// Mounted outside /api so MCP clients can use a stable /mcp path.
// Auth is optional; org-scoped tools enforce Better Auth + permissions.
app.use("/mcp", globalLimiter, mcpRouter);

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
