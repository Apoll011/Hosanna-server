import { NextFunction, Request, Response } from "express";

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps an async route handler so that rejected promises are forwarded to
 * Express's error-handling middleware instead of crashing the process.
 */
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
