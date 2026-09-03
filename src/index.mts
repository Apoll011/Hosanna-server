import { toNodeHandler } from "better-auth/node";
import compression from "compression";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { auth } from "./lib/auth.js";
import { DEFAULT_LOCALE, t } from "./lib/i18n.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

const app = express();

app.set("trust proxy", 1);

// ── HTTPS redirect — must run before anything else ─────────────────────────
// Runs first so we don't waste CPU on parsing/compressing requests that will
// immediately be redirected.
app.use((req, res, next) => {
  if (env.nodeEnv === "production" && !req.secure) {
    return res.redirect(301, `https://${req.header("host")}${req.url}`);
  }
  next();
});

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

// ── Compression — only for responses ≥ 1 KB, skip already-compressed types ─
app.use(
  compression({
    // Don't bother compressing tiny responses — overhead outweighs savings.
    threshold: 1024,
    filter: (req, res) => {
      // Skip if the client explicitly asked for no compression.
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }),
);

// ── Body parsing ─────────────────────────────────────────────────────────────
// Keep the limit tight per route type; 5 MB was too generous for most routes.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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

// ── Better Auth ─────────────────────────────────────────────────────────────
app.all("/api/auth/*", toNodeHandler(auth));

// ── API routes ──────────────────────────────────────────────────────────────
app.use("/api", globalLimiter, apiRouter);

// ── Error handling ──────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────────
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
