export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SONG_NOT_FOUND'
  | 'FOLDER_NOT_FOUND'
  | 'SERVICE_NOT_FOUND'
  | 'MUSICIAN_TOKEN_NOT_FOUND'
  | 'SETTINGS_NOT_FOUND'
  | 'ADMIN_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_MUSICIAN_TOKEN'
  | 'MUSICIAN_TOKEN_EXPIRED'
  | 'MUSICIAN_TOKEN_REVOKED'
  | 'SONG_IN_SERVICE_NOT_FOUND'
  | 'CONFLICT'
  | 'DUPLICATE_EMAIL'
  | 'INVALID_BACKUP_FILE'
  | 'INTERNAL_ERROR';

/**
 * Standard application error. Thrown from services/repositories and turned
 * into the consistent `{ error: { code, message, details? } }` response
 * shape by the global error handler.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static notFound(code: ErrorCode, message: string) {
    return new AppError(404, code, message);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static conflict(message = 'The resource was modified by someone else. Reload and try again.') {
    return new AppError(409, 'CONFLICT', message);
  }
}
