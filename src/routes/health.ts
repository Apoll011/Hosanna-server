import { Router } from "express";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});
