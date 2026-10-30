/**
 * Lightweight MusicBrainz lookup for song metadata (title/artist/key hints).
 * Serializes requests (~1 req/s) and retries 503s — parallel bursts trip MB.
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT =
  "HosannaStudio/1.0 (https://hosanna.live; support@hosanna.live)";
/** MusicBrainz asks for ≤1 request/second without an approved app token. */
const MIN_INTERVAL_MS = 1100;
const MAX_RETRIES = 3;

export type MusicBrainzHit = {
  id: string;
  title: string;
  artist: string;
  score: number;
  release?: string;
  firstReleaseDate?: string;
};

let chain: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run MusicBrainz HTTP work one-at-a-time with spacing. */
function enqueueMb<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastStartedAt));
    if (wait) await sleep(wait);
    lastStartedAt = Date.now();
    return fn();
  });
  // Keep the queue alive even if this call fails.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function fetchMbJson(url: URL): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (res.ok) return res;
    if (res.status === 503 || res.status === 429) {
      lastError = new Error(
        `MusicBrainz error ${res.status}: rate limited — slow down and retry.`,
      );
      await sleep(MIN_INTERVAL_MS * (attempt + 1));
      continue;
    }
    throw new Error(`MusicBrainz error ${res.status}`);
  }
  throw lastError ?? new Error("MusicBrainz error");
}

export async function searchMusicBrainzRecordings(opts: {
  title?: string;
  artist?: string;
  query?: string;
  limit?: number;
}): Promise<{ hits: MusicBrainzHit[]; query: string }> {
  const parts: string[] = [];
  if (opts.query?.trim()) parts.push(opts.query.trim());
  if (opts.title?.trim()) parts.push(`recording:"${opts.title.trim()}"`);
  if (opts.artist?.trim()) parts.push(`artist:"${opts.artist.trim()}"`);
  const query = parts.join(" AND ") || "recording:*";
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);

  const url = new URL(`${MB_BASE}/recording`);
  url.searchParams.set("query", query);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", String(limit));

  return enqueueMb(async () => {
    const res = await fetchMbJson(url);
    const data = (await res.json()) as {
      recordings?: Array<{
        id: string;
        title?: string;
        score?: number;
        "first-release-date"?: string;
        "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
        releases?: Array<{ title?: string }>;
      }>;
    };

    const hits: MusicBrainzHit[] = (data.recordings ?? []).map((r) => {
      const artist =
        r["artist-credit"]
          ?.map((c) => c.name || c.artist?.name || "")
          .filter(Boolean)
          .join(", ") || "Unknown";
      return {
        id: r.id,
        title: r.title || "Untitled",
        artist,
        score: r.score ?? 0,
        release: r.releases?.[0]?.title,
        firstReleaseDate: r["first-release-date"],
      };
    });

    return { hits, query };
  });
}
