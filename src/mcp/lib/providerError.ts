/** Structured failure from an external metadata / search provider. */
export class ProviderError extends Error {
  readonly kind: "unavailable" | "rate_limited" | "auth" | "empty";
  readonly provider: string;
  readonly hint?: string;

  constructor(
    provider: string,
    message: string,
    kind: "unavailable" | "rate_limited" | "auth" | "empty" = "unavailable",
    hint?: string,
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.kind = kind;
    this.hint = hint;
  }
}
