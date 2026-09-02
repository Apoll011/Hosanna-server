export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SUBSCRIPTION_REQUIRED"
  | "SONG_NOT_FOUND"
  | "FOLDER_NOT_FOUND"
  | "SERVICE_NOT_FOUND"
  | "MUSICIAN_TOKEN_NOT_FOUND"
  | "ADMIN_NOT_FOUND"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_NOT_APPROVED"
  | "INVALID_REFRESH_TOKEN"
  | "INVALID_MUSICIAN_TOKEN"
  | "SONG_IN_SERVICE_NOT_FOUND"
  | "CONFLICT"
  | "DUPLICATE_EMAIL"
  | "INVALID_BACKUP_FILE"
  | "INTERNAL_ERROR";

/**
 * Standard application error. Thrown from services/repositories and turned
 * into the consistent `{ error: { code, message, details? } }` response
 * shape by the global error handler.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static notFound(code: ErrorCode, message: string) {
    return new AppError(404, code, message);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "VALIDATION_ERROR", message, details);
  }

  static unauthorized(message = "Authentication required.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(
    message = "You do not have permission to perform this action.",
  ) {
    return new AppError(403, "FORBIDDEN", message);
  }

  /**
   * The organization has no active subscription and is not on a trial, so
   * mutating requests are refused (read-only mode).
   */
  static subscriptionRequired(
    message = "An active subscription or trial is required to perform this action.",
  ) {
    return new AppError(403, "SUBSCRIPTION_REQUIRED", message);
  }

  static conflict(
    message = "The resource was modified by someone else. Reload and try again.",
  ) {
    return new AppError(409, "CONFLICT", message);
  }
}
