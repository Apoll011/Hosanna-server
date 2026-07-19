import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError } from "../types.js";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Buffers must be equal length for timingSafeEqual; pad to avoid leaking
  // length information through an early throw.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // constant-time no-op to equalize timing
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw AppError.unauthorized();
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token || !timingSafeEqual(token, config.syncApiToken)) {
    throw AppError.forbidden();
  }

  next();
}
