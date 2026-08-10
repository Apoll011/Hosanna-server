import { Router } from "express";

import { backupRouter } from "./backup.routes.js";
import { folderRouter } from "./folder.routes.js";
import { healthRouter } from "./health.routes.js";
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

apiRouter.use("/songs", apiLimiter, songRouter);
apiRouter.use("/folders", apiLimiter, folderRouter);
apiRouter.use("/services", apiLimiter, serviceRouter);
apiRouter.use("/settings", apiLimiter, settingsRouter);

apiRouter.use("/backup", backupLimiter, backupRouter);
