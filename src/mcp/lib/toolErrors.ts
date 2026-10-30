import { AppError } from "../../utils/errors.js";
import { IdempotencyConflictError } from "./idempotency.js";
import { ProviderError } from "./providerError.js";

/**
 * Stable MCP tool error codes (audit contract).
 * Prefer these over ad-hoc strings in tool responses.
 */
export type ToolErrorCode =
  | "validation_error"
  | "not_found"
  | "permission_denied"
  | "subscription_required"
  | "conflict"
  | "rate_limited"
  | "provider_unavailable"
  | "internal_error"
  /** @deprecated use conflict — kept for older Studio clients */
  | "stale"
  /** @deprecated use permission_denied */
  | "forbidden"
  /** @deprecated use validation_error */
  | "validation"
  /** @deprecated use subscription_required */
  | "subscription"
  /** @deprecated use internal_error */
  | "error";

export type ToolErrorPayload = {
  error: true;
  code: ToolErrorCode;
  message: string;
  field?: string;
  hint?: string;
  retryable: boolean;
  provider?: string;
  /** On conflict/stale writes, the refreshed entity so the caller can re-merge. */
  current?: unknown;
};

export function toolError(opts: {
  code: ToolErrorCode;
  message: string;
  field?: string;
  hint?: string;
  retryable?: boolean;
  current?: unknown;
  provider?: string;
}): ToolErrorPayload {
  return {
    error: true,
    code: opts.code,
    message: opts.message,
    field: opts.field,
    hint: opts.hint,
    retryable: opts.retryable ?? false,
    provider: opts.provider,
    current: opts.current,
  };
}

export function mapToolError(
  error: unknown,
  opts?: { current?: unknown; field?: string },
): ToolErrorPayload {
  if (error instanceof IdempotencyConflictError) {
    return toolError({
      code: "conflict",
      message: error.message,
      field: "clientRequestId",
      hint: "Reuse the same payload with this clientRequestId, or pick a new id.",
      retryable: false,
    });
  }

  if (error instanceof ProviderError) {
    if (error.kind === "rate_limited") {
      return toolError({
        code: "rate_limited",
        message: error.message,
        provider: error.provider,
        hint: "Wait and retry, or switch metadata provider.",
        retryable: true,
      });
    }
    return toolError({
      code: "provider_unavailable",
      message: error.message,
      provider: error.provider,
      hint: error.hint,
      retryable: error.kind !== "auth",
    });
  }

  if (error instanceof AppError) {
    if (error.code === "CONFLICT") {
      return toolError({
        code: "conflict",
        message: error.message,
        field: opts?.field ?? "updatedAt",
        hint: "Resource changed; re-merge using current.updatedAt and retry.",
        retryable: true,
        current: opts?.current,
      });
    }
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED") {
      return toolError({
        code: "permission_denied",
        message: error.message,
        retryable: false,
      });
    }
    if (error.code === "SUBSCRIPTION_REQUIRED") {
      return toolError({
        code: "subscription_required",
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
        code: "validation_error",
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
    return toolError({
      code: "permission_denied",
      message,
      retryable: false,
    });
  }
  if (lower.includes("subscription")) {
    return toolError({
      code: "subscription_required",
      message,
      retryable: false,
    });
  }
  if (lower.includes("not found")) {
    return toolError({ code: "not_found", message, retryable: false });
  }
  if (
    lower.includes("rate") ||
    lower.includes("429") ||
    lower.includes("too many")
  ) {
    return toolError({
      code: "rate_limited",
      message,
      retryable: true,
      hint: "Back off and retry.",
    });
  }
  if (
    lower.includes("provider") ||
    lower.includes("duckduckgo") ||
    lower.includes("musicbrainz") ||
    lower.includes("youtube") ||
    lower.includes("native web") ||
    lower.includes("unavailable")
  ) {
    return toolError({
      code: "provider_unavailable",
      message,
      retryable: true,
      hint: "Try another metadata provider (MusicBrainz / YouTube) or retry later.",
    });
  }
  if (
    lower.includes("unknown argument") ||
    lower.includes("unknown field") ||
    lower.includes("invalid value") ||
    lower.includes("argument `")
  ) {
    return toolError({
      code: "validation_error",
      message,
      field: opts?.field,
      hint: "Fix the invalid field/argument and retry.",
      retryable: false,
    });
  }
  if (
    lower.includes("was modified") ||
    lower.includes("modified elsewhere") ||
    (lower.includes("conflict") && lower.includes("updatedat")) ||
    lower.includes("optimistic") ||
    lower.includes("idempotency")
  ) {
    return toolError({
      code: "conflict",
      message,
      field: opts?.field ?? "updatedAt",
      hint: "Resource changed or idempotency key conflict; reload and retry.",
      retryable: true,
      current: opts?.current,
    });
  }
  return toolError({
    code: "internal_error",
    message,
    retryable: false,
  });
}

export function isToolError(value: unknown): value is ToolErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ToolErrorPayload).error === true &&
    typeof (value as ToolErrorPayload).code === "string"
  );
}
