import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";
import { songsRouter } from "./routes/songs.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1); // needed for correct req.ip behind a reverse proxy

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      autoLogging: {
        ignore: (req) => req.url === "/api/health",
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
    })
  );

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    })
  );
  app.use(compression());
  app.use(express.json({ limit: config.maxBodySize }));

  // Rate limit only the mutating/costly API surface, not static assets.
  const apiLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api", apiLimiter);

  app.use("/api", healthRouter);
  app.use("/api", syncRouter);
  app.use("/api", songsRouter);

  return app;
}

export async function attachStaticFrontend(app: Express): Promise<void> {
  if (config.isProduction && config.serveStatic) {
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");

    if (!existsSync(config.staticDir)) {
      logger.warn(
        { staticDir: config.staticDir },
        "SERVE_STATIC is enabled but STATIC_DIR does not exist; skipping static hosting"
      );
      return;
    }

    app.use(express.static(config.staticDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(config.staticDir, "index.html"));
    });
    logger.info({ staticDir: config.staticDir }, "Serving static frontend");
    return;
  }

  if (!config.isProduction) {
    // Dev convenience: proxy the SPA through Vite's middleware if it's
    // installed, mirroring the original dev-server behavior. Vite is an
    // optional dependency so this is loaded lazily and fails soft.
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      logger.info("Vite dev middleware attached");
    } catch (err) {
      logger.debug({ err }, "Vite not available; running API-only");
    }
  }
}

export function attachErrorHandlers(app: Express): void {
  app.use(notFoundHandler);
  app.use(errorHandler);
}
