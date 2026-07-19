import { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  req.id = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
