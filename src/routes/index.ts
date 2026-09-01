import { Router } from "express";

import { backupRouter } from "./backup.routes.js";
import { cronRouter } from "./cron.routes.js";
import { folderRouter } from "./folder.routes.js";
import { healthRouter } from "./health.routes.js";
import { notificationsRouter } from "./notifications.routes.js";
import { replicationRouter } from "./replication.routes.js";
import { serviceRouter } from "./service.routes.js";
import { songRouter } from "./song.routes.js";
import { trashRouter } from "./trash.routes.js";

import { authenticate } from "../middleware/auth.js";
import {
  apiLimiter,
  backupLimiter,
  healthLimiter,
  syncLimiter,
} from "../middleware/rateLimit.js";
import { cifraRouter } from "./cifra.route.js";
import anotationRouter from "./serviceSongAnnotation.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthLimiter, healthRouter);
apiRouter.use("/cron", cronRouter);

apiRouter.use(authenticate);
apiRouter.use("/replication", syncLimiter, replicationRouter);

apiRouter.use("/songs", apiLimiter, songRouter);
apiRouter.use("/folders", apiLimiter, folderRouter);
apiRouter.use("/services", apiLimiter, serviceRouter);
apiRouter.use("/notifications", apiLimiter, notificationsRouter);
apiRouter.use("/cifra", apiLimiter, cifraRouter);
apiRouter.use("/trash", apiLimiter, trashRouter);
apiRouter.use("/annotation", apiLimiter, anotationRouter);

apiRouter.use("/backup", backupLimiter, backupRouter);
