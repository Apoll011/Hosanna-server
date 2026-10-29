/**
 * General web search for song metadata / reference links.
 * Prefers provider-native Search (DeepSeek) when org BYOK supports it;
 * otherwise DuckDuckGo HTML (no API key).
 */

import {
  type NativeWebAuth,
  nativeWebSearch,
  providerSupportsNativeSearch,
} from "./nativeWeb.js";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
};

export type WebSearchProvider = "deepseek" | "duckduckgo";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function isDuckDuckGoChallenge(html: string): boolean {
  return (
    /anomaly-modal/i.test(html) ||
    /bots use DuckDuckGo/i.test(html) ||
    /anomaly\.js\?sv=html/i.test(html) ||
    /cc=botnet/i.test(html)
  );
}

function parseDuckDuckGoHtml(html: string, limit: number): WebSearchHit[] {
  const hits: WebSearchHit[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && hits.length < limit) {
    let href = match[1];
    try {
      const parsed = new URL(href, "https://duckduckgo.com");
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) href = decodeURIComponent(uddg);
    } catch {
      /* keep href */
    }
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, "")).trim();
    if (!href.startsWith("http") || !title) continue;
    hits.push({ title, url: href });
  }

  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  let i = 0;
  let snip: RegExpExecArray | null;
  while ((snip = snipRe.exec(html)) && i < hits.length) {
    hits[i].snippet = decodeHtml(snip[1].replace(/<[^>]+>/g, "")).trim();
    i += 1;
  }

  return hits;
}

async function fetchDuckDuckGoHtml(query: string): Promise<string> {
  const headers: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
    "User-Agent": BROWSER_UA,
  };

  let res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ q: query }).toString(),
  });

  if (!res.ok) {
    const url = new URL("https://html.duckduckgo.com/html/");
    url.searchParams.set("q", query);
    res = await fetch(url, { headers });
  }

  if (!res.ok) {
    throw new Error(
      `DuckDuckGo error ${res.status}: HTML search blocked or unavailable. Retry shortly.`,
    );
  }

  return res.text();
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  let html = await fetchDuckDuckGoHtml(query);

  if (isDuckDuckGoChallenge(html)) {
    await new Promise((r) => setTimeout(r, 1500));
    html = await fetchDuckDuckGoHtml(query);
  }

  if (isDuckDuckGoChallenge(html)) {
    throw new Error(
      "DuckDuckGo bot challenge (403/202): rate-limited from this server. Wait a minute and retry, or use DeepSeek as the org AI provider (native Search).",
    );
  }

  return parseDuckDuckGoHtml(html, limit);
}

export async function searchWeb(opts: {
  query: string;
  limit?: number;
  /** User's original question — improves DeepSeek query understanding. */
  oriQuestion?: string;
  /** When set and provider supports native search, prefer that over DuckDuckGo. */
  nativeAuth?: NativeWebAuth | null;
}): Promise<{
  results: WebSearchHit[];
  query: string;
  provider: WebSearchProvider;
  note?: string;
}> {
  const query = opts.query?.trim();
  if (!query) {
    return {
      results: [],
      query: "",
      provider: "duckduckgo",
      note: "Provide a non-empty query.",
    };
  }
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
  const auth = opts.nativeAuth;

  if (auth && providerSupportsNativeSearch(auth.provider)) {
    try {
      const { hits, provider } = await nativeWebSearch(auth, {
        query: query.slice(0, 128),
        count: limit,
        oriQuestion: opts.oriQuestion,
      });
      const results: WebSearchHit[] = hits.map((h) => ({
        title: h.title,
        url: h.url,
        snippet: h.snippet ?? h.summary?.slice(0, 200),
        summary: h.summary,
      }));
      return {
        results,
        query,
        provider: provider === "deepseek" ? "deepseek" : "duckduckgo",
        note: results.length
          ? `Native ${provider} Search.`
          : `Native ${provider} Search returned no results.`,
      };
    } catch (nativeErr) {
      const nativeMessage =
        nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
      try {
        const results = await searchDuckDuckGo(query, limit);
        return {
          results,
          query,
          provider: "duckduckgo",
          note: results.length
            ? `Native search failed (${nativeMessage}); fell back to DuckDuckGo.`
            : `Native search failed (${nativeMessage}); DuckDuckGo also empty.`,
        };
      } catch (ddgErr) {
        const ddgMessage =
          ddgErr instanceof Error ? ddgErr.message : String(ddgErr);
        throw new Error(
          `Web search failed — native: ${nativeMessage}; DuckDuckGo: ${ddgMessage}`,
        );
      }
    }
  }

  const results = await searchDuckDuckGo(query, limit);
  return {
    results,
    query,
    provider: "duckduckgo",
    note: results.length
      ? undefined
      : "No DuckDuckGo results for this query.",
  };
}
