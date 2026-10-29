/**
 * Provider-native web Search / Fetch when the org's BYOK AI exposes them.
 * Today: DeepSeek (`POST /v1/tools/search` + `/v1/tools/fetch`).
 * Other vendors (OpenAI/Anthropic/Google) may offer in-chat browsing, but not
 * a separate REST search we can call from our own `metadata_web_*` tools.
 */

import {
  type AiProvider,
  OrgAiConfigService,
} from "../../services/orgAiConfig.service.js";
import {
  providerSupportsNativeFetch,
  providerSupportsNativeSearch,
} from "./nativeWebCapabilities.js";

export {
  NATIVE_WEB_CAPABILITIES,
  providerSupportsNativeFetch,
  providerSupportsNativeSearch,
  type NativeWebCapability,
} from "./nativeWebCapabilities.js";

export type NativeWebAuth = {
  provider: AiProvider;
  apiKey: string;
  /** Provider API origin, e.g. https://api.deepseek.com (no trailing slash). */
  baseUrl: string;
};

export type NativeSearchHit = {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
  content?: string;
  siteName?: string | null;
  date?: string | null;
  authority?: number;
  rerankScore?: number;
};

export type NativeFetchResult = {
  title: string;
  content: string;
};

function toolsBase(baseUrl: string): string {
  // DeepSeek docs: https://api.deepseek.com + /v1/tools/search
  // Org config may store https://api.deepseek.com or .../v1
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/tools`;
  }
  return `${trimmed}/v1/tools`;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string };
    };
    if (parsed.error?.message) {
      return `${parsed.error.message}${parsed.error.code ? ` (${parsed.error.code})` : ""}`;
    }
  } catch {
    /* raw */
  }
  return body.slice(0, 240) || res.statusText;
}

/** DeepSeek Search API. */
export async function nativeWebSearch(
  auth: NativeWebAuth,
  opts: {
    query: string;
    count?: number;
    oriQuestion?: string;
    needContent?: boolean;
  },
): Promise<{ hits: NativeSearchHit[]; provider: AiProvider }> {
  if (!providerSupportsNativeSearch(auth.provider)) {
    throw new Error(
      `Provider ${auth.provider} has no native web search API for Hosanna tools.`,
    );
  }

  const query = opts.query.trim().slice(0, 128);
  if (!query) throw new Error("Search query is empty.");

  const count = Math.min(Math.max(opts.count ?? 10, 1), 50);
  const url = `${toolsBase(auth.baseUrl)}/search`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(auth.apiKey),
    body: JSON.stringify({
      query,
      count,
      ori_question: opts.oriQuestion?.trim().slice(0, 128) || null,
      need_content: Boolean(opts.needContent),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Native web search (${auth.provider}) error ${res.status}: ${await readError(res)}`,
    );
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      summary?: string;
      content?: string;
      site_name?: string | null;
      date?: string | null;
      authority?: number;
      rerank_score?: number;
    }>;
  };

  const hits: NativeSearchHit[] = (data.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      snippet: r.snippet || undefined,
      summary: r.summary || undefined,
      content: r.content || undefined,
      siteName: r.site_name ?? null,
      date: r.date ?? null,
      authority: r.authority,
      rerankScore: r.rerank_score,
    }));

  return { hits, provider: auth.provider };
}

/** DeepSeek Fetch API — page → Markdown. */
export async function nativeWebFetch(
  auth: NativeWebAuth,
  pageUrl: string,
): Promise<NativeFetchResult> {
  if (!providerSupportsNativeFetch(auth.provider)) {
    throw new Error(
      `Provider ${auth.provider} has no native web fetch API for Hosanna tools.`,
    );
  }

  const trimmed = pageUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("Fetch URL must be http(s).");
  }

  const url = `${toolsBase(auth.baseUrl)}/fetch`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(auth.apiKey),
    body: JSON.stringify({ url: trimmed.slice(0, 8192) }),
  });

  if (!res.ok) {
    throw new Error(
      `Native web fetch (${auth.provider}) error ${res.status}: ${await readError(res)}`,
    );
  }

  const data = (await res.json()) as { title?: string; content?: string };
  return {
    title: data.title ?? "",
    content: data.content ?? "",
  };
}

/**
 * Load org BYOK credentials when that provider supports native Search/Fetch.
 * Returns null when AI is off, key missing, or provider has no native web tools.
 */
export async function resolveNativeWebAuth(
  orgId: string,
): Promise<NativeWebAuth | null> {
  try {
    const runtime = await new OrgAiConfigService().getRuntimeConfig(orgId);
    if (!providerSupportsNativeSearch(runtime.provider)) return null;
    const baseUrl =
      runtime.baseUrl?.replace(/\/+$/, "") ||
      "https://api.deepseek.com";
    return {
      provider: runtime.provider,
      apiKey: runtime.apiKey,
      baseUrl,
    };
  } catch {
    return null;
  }
}

/** Build from an already-loaded Studio chat runtime (avoids double decrypt). */
export function nativeWebAuthFromRuntime(runtime: {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string | null;
}): NativeWebAuth | null {
  if (!providerSupportsNativeSearch(runtime.provider)) return null;
  return {
    provider: runtime.provider,
    apiKey: runtime.apiKey,
    baseUrl: runtime.baseUrl?.replace(/\/+$/, "") || "https://api.deepseek.com",
  };
}
