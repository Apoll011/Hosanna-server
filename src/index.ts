import compression from "compression";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiRouter } from "./routes";

const app = express();

// ── Global rate limiter ────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Demasiados pedidos. Por favor, tente novamente mais tarde.",
    },
  },
  skip: () => env.nodeEnv !== "production",
});

// ── Trust proxy (needed for correct IP behind load-balancers / nginx) ──────
app.set("trust proxy", 1);

// ── Security headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    hsts:
      env.nodeEnv === "production"
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    // Prevent MIME-type sniffing
    noSniff: true,
    // Prevent clickjacking
    frameguard: { action: "deny" },
    // XSS filter for older browsers
    xssFilter: true,
    // Remove X-Powered-By header
    hidePoweredBy: true,
  }),
);

// ── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({ origin: env.corsOrigin, credentials: true }));

// ── Response compression ───────────────────────────────────────────────────
// Compress all responses > 1 KB using gzip/deflate.
// Sync status checks, song lists, and backup payloads benefit significantly.
app.use(compression());

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── HTTPS redirect ──────────────────────────────────────
app.use((req, res, next) => {
  if (env.nodeEnv === "production" && !req.secure) {
    return res.redirect(301, `https://${req.header("host")}${req.url}`);
  }
  next();
});

// ── Request timing header ──────────────────────────────────────────────────
// Attaches X-Response-Time: <ms>ms to every response for observability.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    res.setHeader("X-Response-Time", `${Date.now() - start}ms`);
  });
  next();
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use("/api", globalLimiter, apiRouter);

// ── Error handling ─────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `Hosanna API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`,
  );
});
