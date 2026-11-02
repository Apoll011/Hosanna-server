import { AppError } from "../../utils/errors.js";
import type { AiBalanceInfo, AiBillingSupported } from "./types.js";

const REQUEST_TIMEOUT_MS = 15_000;

type DeepSeekBalanceRaw = {
  is_available?: boolean;
  balance_infos?: Array<{
    currency?: string;
    total_balance?: string;
    granted_balance?: string;
    topped_up_balance?: string;
  }>;
};

/** Strip trailing `/v1` so `/user/balance` hits the API origin. */
export function deepseekApiOrigin(baseUrl: string | null): string {
  const raw = (baseUrl?.trim() || "https://api.deepseek.com").replace(
    /\/+$/,
    "",
  );
  return raw.replace(/\/v1$/i, "");
}

async function readErrorBody(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string | number };
      message?: string;
    };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
    if (typeof parsed.message === "string" && parsed.message) {
      return parsed.message;
    }
  } catch {
    /* raw */
  }
  return body.slice(0, 240) || res.statusText;
}

export async function fetchDeepSeekBalance(opts: {
  apiKey: string;
  baseUrl: string | null;
}): Promise<AiBillingSupported> {
  const origin = deepseekApiOrigin(opts.baseUrl);
  const url = `${origin}/user/balance`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "DeepSeek balance request timed out."
        : "Could not reach DeepSeek to fetch balance.";
    throw new AppError(502, "INTERNAL_ERROR", message);
  }

  if (res.status === 401 || res.status === 403) {
    throw AppError.badRequest(
      "DeepSeek rejected the API key. Check the key in AI settings.",
    );
  }
  if (res.status === 429) {
    throw new AppError(
      429,
      "INTERNAL_ERROR",
      "DeepSeek is rate-limiting balance requests. Try again shortly.",
    );
  }
  if (!res.ok) {
    const detail = await readErrorBody(res);
    throw new AppError(
      502,
      "INTERNAL_ERROR",
      `DeepSeek balance request failed (${res.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  let raw: DeepSeekBalanceRaw;
  try {
    raw = (await res.json()) as DeepSeekBalanceRaw;
  } catch {
    throw new AppError(
      502,
      "INTERNAL_ERROR",
      "DeepSeek returned an invalid balance response.",
    );
  }

  const balances: AiBalanceInfo[] = (raw.balance_infos ?? []).map((b) => ({
    currency: b.currency ?? "CNY",
    totalBalance: b.total_balance ?? "0.00",
    grantedBalance: b.granted_balance ?? "0.00",
    toppedUpBalance: b.topped_up_balance ?? "0.00",
  }));

  return {
    supported: true,
    provider: "deepseek",
    kind: "balance",
    isAvailable: Boolean(raw.is_available),
    balances,
    fetchedAt: new Date().toISOString(),
  };
}
