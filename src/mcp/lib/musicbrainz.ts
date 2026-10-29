/**
 * Lightweight MusicBrainz lookup for song metadata (title/artist/key hints).
 * Respects MB rate limits via a User-Agent; no API key required.
 */

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "HosannaStudio/1.0 (https://hosanna.live; support@hosanna.live)";

export type MusicBrainzHit = {
  id: string;
  title: string;
  artist: string;
  score: number;
  release?: string;
  firstReleaseDate?: string;
};

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

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`MusicBrainz error ${res.status}`);
  }
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
}
