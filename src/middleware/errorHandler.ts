import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";
import { AppError } from "../types.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Cannot ${req.method} ${req.path}`));
}

// Express recognizes error-handling middleware by arity (4 params) - keep
// all four even though `next` is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
      requestId: req.id,
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId: req.id }, "Request failed with server error");
    } else {
      logger.warn({ requestId: req.id, code: err.code }, err.message);
    }
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      requestId: req.id,
    });
    return;
  }

  logger.error({ err, requestId: req.id }, "Unhandled error");
  res.status(500).json({
    error: "Internal Server Error",
    code: "INTERNAL_ERROR",
    requestId: req.id,
  });
}

/** Wraps an async route handler so rejected promises reach errorHandler. */
export function asyncHandler<T extends (req: Request, res: Response) => Promise<void>>(
  fn: T
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}
