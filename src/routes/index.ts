import { Router } from "express";

import { backupRouter } from "./backup.routes.js";
import { folderRouter } from "./folder.routes.js";
import { healthRouter } from "./health.routes.js";
import { notificationsRouter } from "./notifications.routes.js";
import { replicationRouter } from "./replication.routes.js";
import { serviceRouter } from "./service.routes.js";
import { settingsRouter } from "./settings.routes.js";
import { songRouter } from "./song.routes.js";
import { syncRouter } from "./sync.routes.js";

import { authenticate } from "../middleware/auth.js";
import {
  apiLimiter,
  backupLimiter,
  healthLimiter,
  syncLimiter,
} from "../middleware/rateLimit.js";

export const apiRouter = Router();

apiRouter.use("/health", healthLimiter, healthRouter);

apiRouter.use(authenticate);
apiRouter.use("/sync", syncLimiter, syncRouter);
apiRouter.use("/replication", syncLimiter, replicationRouter);

apiRouter.use("/songs", apiLimiter, songRouter);
apiRouter.use("/folders", apiLimiter, folderRouter);
apiRouter.use("/services", apiLimiter, serviceRouter);
apiRouter.use("/settings", apiLimiter, settingsRouter);
apiRouter.use("/notifications", apiLimiter, notificationsRouter);

apiRouter.use("/backup", backupLimiter, backupRouter);
