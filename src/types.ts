export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Token de segurança ausente ou inválido.") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Acesso negado. Token incorreto.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Recurso não encontrado.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static payloadTooLarge(message: string) {
    return new AppError(413, "PAYLOAD_TOO_LARGE", message);
  }

  static internal(message = "Internal Server Error", details?: unknown) {
    return new AppError(500, "INTERNAL_ERROR", message, details);
  }
}

export interface SongFile {
  path: string;
  content: string;
  updatedAt: number;
}

export interface ServiceRecord {
  id: string;
  [key: string]: unknown;
}

export interface SyncResponseBody {
  files: SongFile[];
  services: ServiceRecord[];
  syncedAt: string;
}
