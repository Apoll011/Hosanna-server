import { Router } from "express";

import { authRouter } from "./auth.routes";
import { backupRouter } from "./backup.routes";
import { folderRouter } from "./folder.routes";
import { healthRouter } from "./health.routes";
import { musicianTokenRouter } from "./musicianToken.routes";
import { printRouter } from "./print.routes";
import { serviceRouter } from "./service.routes";
import { settingsRouter } from "./settings.routes";
import { songRouter } from "./song.routes";
import { syncRouter } from "./sync.routes";
import { tenantRouter } from "./tenant.routes";

import {
  apiLimiter,
  authLimiter,
  backupLimiter,
  healthLimiter,
  loginLimiter,
  syncLimiter,
} from "../middleware/rateLimit";

export const apiRouter = Router();

apiRouter.use("/health", healthLimiter, healthRouter);

// Apply the general auth limiter across all /auth routes, plus a tighter
// loginLimiter just for the login endpoint (IP-level brute-force defence).
apiRouter.post("/auth/login", loginLimiter);
apiRouter.use("/auth", authLimiter, authRouter);

apiRouter.use("/sync", syncLimiter, syncRouter);

apiRouter.use("/tenants", apiLimiter, tenantRouter);
apiRouter.use("/songs", apiLimiter, songRouter);
apiRouter.use("/folders", apiLimiter, folderRouter);
apiRouter.use("/services", apiLimiter, serviceRouter);
apiRouter.use("/musicians/tokens", apiLimiter, musicianTokenRouter);
apiRouter.use("/settings", apiLimiter, settingsRouter);
apiRouter.use("/print", apiLimiter, printRouter);

apiRouter.use("/backup", backupLimiter, backupRouter);
