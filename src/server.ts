import { createServer } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { initDataDirs } from "./services/fileService.js";
import { createApp, attachErrorHandlers, attachStaticFrontend } from "./app.js";

async function main(): Promise<void> {
  await initDataDirs();

  const app = createApp();
  await attachStaticFrontend(app);
  attachErrorHandlers(app);

  const server = createServer(app);

  server.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, env: config.nodeEnv },
      `Server listening on http://${config.host}:${config.port}`
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
