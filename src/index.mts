import { toNodeHandler } from "better-auth/node";
import compression from "compression";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { auth } from "./lib/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

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

app.set("trust proxy", 1);
app.disable("etag");

app.use(
  cors({
    origin: [
      "https://dashboard-hosanna.duckdns.org",
      "https://www.dashboard-hosanna.duckdns.org",
      "https://hosana.vercel.app",
      "http://localhost:3000",
      "http://localhost",
    ],
    credentials: true,
  }),
);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// ── Security headers ────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
    hsts:
      env.nodeEnv === "production"
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    noSniff: true,
    frameguard: { action: "deny" },
    xssFilter: true,
    hidePoweredBy: true,
  }),
);

// ── Better Auth ────────────────────────────────────────────────────────
app.all("/api/auth/*", toNodeHandler(auth));

// ── Compression ────────────────────────────────────────────────────────
app.use(compression());

// ── Body parsing ───────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── HTTPS redirect ─────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (env.nodeEnv === "production" && !req.secure) {
    return res.redirect(301, `https://${req.header("host")}${req.url}`);
  }

  next();
});

// ── API routes ─────────────────────────────────────────────────────────
app.use("/api", globalLimiter, apiRouter);

// ── Error handling ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(env.port, "0.0.0.0", () => {
  console.log(
    `Hosanna API listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`,
  );
});
