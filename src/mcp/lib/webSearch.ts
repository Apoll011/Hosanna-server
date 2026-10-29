/**
 * General web search for song metadata / reference links.
 * Uses DuckDuckGo HTML results (no API key).
 */

export type WebSearchHit = {
  title: string;
  url: string;
  snippet?: string;
};

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

/**
 * Best-effort DuckDuckGo HTML scrape. Parse failures return an empty list.
 */
async function searchDuckDuckGo(
  query: string,
  limit: number,
): Promise<WebSearchHit[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent":
        "HosannaStudio/1.0 (https://hosanna.live; support@hosanna.live)",
    },
  });
  if (!res.ok) {
    throw new Error(`DuckDuckGo error ${res.status}`);
  }
  const html = await res.text();
  const hits: WebSearchHit[] = [];
  const re =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && hits.length < limit) {
    let href = match[1];
    // DDG wraps redirects: /l/?uddg=<encoded>
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

  // Snippets (optional)
  const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  let i = 0;
  let snip: RegExpExecArray | null;
  while ((snip = snipRe.exec(html)) && i < hits.length) {
    hits[i].snippet = decodeHtml(snip[1].replace(/<[^>]+>/g, "")).trim();
    i += 1;
  }

  return hits;
}

export async function searchWeb(opts: {
  query: string;
  limit?: number;
}): Promise<{
  results: WebSearchHit[];
  query: string;
  provider: "duckduckgo";
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
