import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDataDirs } from "./services/fileService.js";
import { createApp, attachErrorHandlers, attachStaticFrontend } from "./app.js";

async function main(): Promise<void> {
  await initDataDirs();

  const app = createApp();
  await attachStaticFrontend(app);
  attachErrorHandlers(app);

  let server;
  if (config.httpsEnabled) {
    if (!config.sslKeyFile || !config.sslCrtFile) {
      logger.fatal("HTTPS is enabled but SSL_KEY_FILE or SSL_CRT_FILE is not set");
      process.exit(1);
    }

    try {
      const options = {
        key: readFileSync(config.sslKeyFile),
        cert: readFileSync(config.sslCrtFile),
      };
      server = createHttpsServer(options, app);
    } catch (err) {
      logger.fatal({ err }, "Failed to load SSL certificates");
      process.exit(1);
    }
  } else {
    server = createHttpServer(app);
  }

  const protocol = config.httpsEnabled ? "https" : "http";
  server.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, env: config.nodeEnv, protocol },
      `Server listening on ${protocol}://${config.host}:${config.port}`
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down gracefully...");

    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
      logger.info("Server closed. Bye!");
      process.exit(0);
    });

    // Force-exit if connections don't drain in time.
    setTimeout(() => {
      logger.warn("Forcing shutdown after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception - exiting");
    process.exit(1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
