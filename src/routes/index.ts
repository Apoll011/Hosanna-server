import { Router } from "express";

import { backupRouter } from "./backup.routes";
import { folderRouter } from "./folder.routes";
import { healthRouter } from "./health.routes";
import { serviceRouter } from "./service.routes";
import { settingsRouter } from "./settings.routes";
import { songRouter } from "./song.routes";
import { syncRouter } from "./sync.routes";

import { toNodeHandler } from "better-auth/node";
import { auth } from "../lib/auth";
import { authenticate } from "../middleware/auth";
import {
  apiLimiter,
  backupLimiter,
  healthLimiter,
  syncLimiter,
} from "../middleware/rateLimit";

export const apiRouter = Router();

apiRouter.use("/health", healthLimiter, healthRouter);

apiRouter.all("/auth/*", toNodeHandler(auth));
apiRouter.use(authenticate);
apiRouter.use("/sync", syncLimiter, syncRouter);

apiRouter.use("/songs", apiLimiter, songRouter);
apiRouter.use("/folders", apiLimiter, folderRouter);
apiRouter.use("/services", apiLimiter, serviceRouter);
apiRouter.use("/settings", apiLimiter, settingsRouter);

apiRouter.use("/backup", backupLimiter, backupRouter);
