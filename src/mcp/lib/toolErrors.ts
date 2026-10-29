import { AppError } from "../../utils/errors.js";

export type ToolErrorCode =
  | "stale"
  | "forbidden"
  | "validation"
  | "not_found"
  | "subscription"
  | "error";

export type ToolErrorPayload = {
  error: true;
  code: ToolErrorCode;
  message: string;
  field?: string;
  hint?: string;
  retryable: boolean;
  /** On stale writes, the refreshed entity so the caller can re-merge. */
  current?: unknown;
};

export function toolError(opts: {
  code: ToolErrorCode;
  message: string;
  field?: string;
  hint?: string;
  retryable?: boolean;
  current?: unknown;
}): ToolErrorPayload {
  return {
    error: true,
    code: opts.code,
    message: opts.message,
    field: opts.field,
    hint: opts.hint,
    retryable: opts.retryable ?? false,
    current: opts.current,
  };
}

export function mapToolError(
  error: unknown,
  opts?: { current?: unknown; field?: string },
): ToolErrorPayload {
  if (error instanceof AppError) {
    if (error.code === "CONFLICT") {
      return toolError({
        code: "stale",
        message: error.message,
        field: opts?.field ?? "updatedAt",
        hint: "Resource changed; re-merge using current.updatedAt and retry.",
        retryable: true,
        current: opts?.current,
      });
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
      return toolError({
        code: "forbidden",
        message: error.message,
        retryable: false,
      });
    }
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return toolError({
        code: "subscription",
        message: error.message,
        retryable: false,
        hint: "Organization needs an active subscription for writes.",
      });
    }
    if (error.code.endsWith("_NOT_FOUND") || error.status === 404) {
      return toolError({
        code: "not_found",
        message: error.message,
        retryable: false,
      });
    }
    if (error.code === "VALIDATION_ERROR") {
      return toolError({
        code: "validation",
        message: error.message,
        field: opts?.field,
        retryable: false,
        current: error.details,
      });
    }
  }

  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = message.toLowerCase();
  if (lower.includes("permission") || lower.includes("forbidden")) {
    return toolError({ code: "forbidden", message, retryable: false });
  }
  if (lower.includes("subscription")) {
    return toolError({ code: "subscription", message, retryable: false });
  }
  if (lower.includes("not found")) {
    return toolError({ code: "not_found", message, retryable: false });
  }
  if (
    lower.includes("modified") ||
    lower.includes("conflict") ||
    lower.includes("updatedat")
  ) {
    return toolError({
      code: "stale",
      message,
      field: opts?.field ?? "updatedAt",
      hint: "Resource changed; re-merge using current.updatedAt and retry.",
      retryable: true,
      current: opts?.current,
    });
  }
  return toolError({ code: "error", message, retryable: false });
}

export function isToolError(value: unknown): value is ToolErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ToolErrorPayload).error === true &&
    typeof (value as ToolErrorPayload).code === "string"
  );
}
