/**
 * General web search for song metadata / reference links.
 * Prefers provider-native Search (DeepSeek) when org BYOK supports it;
 * otherwise DuckDuckGo HTML → Instant Answer API → Wikipedia OpenSearch.
 */

import {
  type NativeWebAuth,
  nativeWebSearch,
  providerSupportsNativeSearch,
} from "./nativeWeb.js";
import { ProviderError } from "./providerError.js";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
};

export type WebSearchProvider =
  | "deepseek"
  | "duckduckgo"
  | "duckduckgo_ia"
  | "wikipedia";

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

  if (res.status === 403 || res.status === 429) {
    throw new ProviderError(
      "duckduckgo",
      `DuckDuckGo HTML search blocked (${res.status})`,
      res.status === 429 ? "rate_limited" : "unavailable",
      "Falling back to Instant Answer / Wikipedia.",
    );
  }

  if (!res.ok) {
    throw new ProviderError(
      "duckduckgo",
      `DuckDuckGo error ${res.status}: HTML search blocked or unavailable.`,
      "unavailable",
    );
  }

  return res.text();
}

async function searchDuckDuckGoHtml(
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  let html = await fetchDuckDuckGoHtml(query);

  if (isDuckDuckGoChallenge(html)) {
    await new Promise((r) => setTimeout(r, 1500));
    html = await fetchDuckDuckGoHtml(query);
  }

  if (isDuckDuckGoChallenge(html)) {
    throw new ProviderError(
      "duckduckgo",
      "DuckDuckGo bot challenge (403/202): rate-limited from this server.",
      "rate_limited",
      "Use DeepSeek org AI Search, or rely on Instant Answer / Wikipedia fallback.",
    );
  }

  return parseDuckDuckGoHtml(html, limit);
}

/** Less-blocked JSON Instant Answer API (Abstract / RelatedTopics). */
async function searchDuckDuckGoInstantAnswer(
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": BROWSER_UA },
  });
  if (!res.ok) {
    throw new ProviderError(
      "duckduckgo_ia",
      `DuckDuckGo Instant Answer HTTP ${res.status}`,
      res.status === 429 ? "rate_limited" : "unavailable",
    );
  }

  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<
      | { Text?: string; FirstURL?: string }
      | { Topics?: Array<{ Text?: string; FirstURL?: string }> }
    >;
  };

  const hits: WebSearchHit[] = [];
  if (data.AbstractURL && (data.Heading || data.AbstractText)) {
    hits.push({
      title: data.Heading || query,
      url: data.AbstractURL,
      snippet: data.AbstractText?.slice(0, 280),
    });
  }

  const pushTopic = (t: { Text?: string; FirstURL?: string }) => {
    if (!t.FirstURL || !t.Text || hits.length >= limit) return;
    hits.push({
      title: t.Text.split(" - ")[0]?.trim() || t.Text.slice(0, 80),
      url: t.FirstURL,
      snippet: t.Text.slice(0, 280),
    });
  };

  for (const topic of data.RelatedTopics ?? []) {
    if ("FirstURL" in topic) pushTopic(topic);
    if ("Topics" in topic && Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics) pushTopic(nested);
    }
  }

  return hits.slice(0, limit);
}

async function searchWikipedia(
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");

  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "HosannaMCP/2.20" },
  });
  if (!res.ok) {
    throw new ProviderError(
      "wikipedia",
      `Wikipedia OpenSearch HTTP ${res.status}`,
      "unavailable",
    );
  }

  const data = (await res.json()) as [
    string,
    string[],
    string[],
    string[],
  ];
  const titles = data[1] ?? [];
  const descriptions = data[2] ?? [];
  const links = data[3] ?? [];
  const hits: WebSearchHit[] = [];
  for (let i = 0; i < titles.length && hits.length < limit; i++) {
    const href = links[i];
    if (!href) continue;
    hits.push({
      title: titles[i]!,
      url: href,
      snippet: descriptions[i] || undefined,
    });
  }
  return hits;
}

type FallbackAttempt = {
  provider: WebSearchProvider;
  results: WebSearchHit[];
  note?: string;
};

async function tryFallbackChain(
  query: string,
  limit: number,
  priorNote?: string,
): Promise<FallbackAttempt> {
  const errors: string[] = [];

  try {
    const results = await searchDuckDuckGoHtml(query, limit);
    if (results.length) {
      return {
        provider: "duckduckgo",
        results,
        note: priorNote,
      };
    }
    errors.push("duckduckgo: empty");
  } catch (e) {
    errors.push(
      `duckduckgo: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const results = await searchDuckDuckGoInstantAnswer(query, limit);
    if (results.length) {
      return {
        provider: "duckduckgo_ia",
        results,
        note: [
          priorNote,
          "Fell back to DuckDuckGo Instant Answer API.",
          errors.length ? `Prior: ${errors.join("; ")}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    errors.push("duckduckgo_ia: empty");
  } catch (e) {
    errors.push(
      `duckduckgo_ia: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  try {
    const results = await searchWikipedia(query, limit);
    if (results.length) {
      return {
        provider: "wikipedia",
        results,
        note: [
          priorNote,
          "Fell back to Wikipedia OpenSearch.",
          errors.length ? `Prior: ${errors.join("; ")}` : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
    errors.push("wikipedia: empty");
  } catch (e) {
    errors.push(
      `wikipedia: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  throw new ProviderError(
    "web_search",
    `All web search providers failed: ${errors.join("; ")}`,
    "unavailable",
    "Try MusicBrainz / YouTube metadata tools, or enable DeepSeek Search for the org.",
  );
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
  providersTried?: string[];
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
      if (results.length) {
        return {
          results,
          query,
          provider: provider === "deepseek" ? "deepseek" : "duckduckgo",
          note: `Native ${provider} Search.`,
        };
      }
      const fallback = await tryFallbackChain(
        query,
        limit,
        `Native ${provider} Search returned no results.`,
      );
      return { query, ...fallback };
    } catch (nativeErr) {
      const nativeMessage =
        nativeErr instanceof Error ? nativeErr.message : String(nativeErr);
      const fallback = await tryFallbackChain(
        query,
        limit,
        `Native search failed (${nativeMessage}).`,
      );
      return { query, ...fallback };
    }
  }

  const fallback = await tryFallbackChain(query, limit);
  return { query, ...fallback };
}
