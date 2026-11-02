/**
 * YouTube video search for populating ChordPro `{youtube: ...}` directives.
 * Prefers YouTube Data API v3 when YOUTUBE_API_KEY is set; otherwise falls
 * back to web search restricted to youtube.com. API failures also fall back.
 */

import { env } from "../../config/env.js";
import type { NativeWebAuth } from "./nativeWeb.js";
import { searchWeb } from "./webSearch.js";

const YT_SEARCH_API = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS_API = "https://www.googleapis.com/youtube/v3/videos";
const VIDEO_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const ISO_DURATION_RE = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i;

export type YouTubeHit = {
  videoId: string;
  title: string;
  channel?: string;
  url: string;
  /** Ready-to-paste ChordPro directive */
  directive: string;
  description?: string;
  publishedAt?: string;
};

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeDirective(videoIdOrUrl: string): string {
  const id = extractYouTubeVideoId(videoIdOrUrl) ?? videoIdOrUrl;
  return `{youtube: ${youtubeWatchUrl(id)}}`;
}

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (BARE_ID_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(VIDEO_ID_RE);
  return match?.[1] ?? null;
}

/** Parse YouTube Data API ISO-8601 durations like `PT4M35S`. */
export function parseYouTubeIsoDuration(iso: string): number | null {
  const match = iso.trim().match(ISO_DURATION_RE);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

/** Format seconds as ChordPro-friendly `M:SS` / `H:MM:SS`. */
export function formatChordProDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const ss = seconds.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

export type YouTubeDurationResult = {
  videoId: string;
  url: string;
  durationSeconds: number;
  /** Ready-to-paste ChordPro value, e.g. `4:35` */
  duration: string;
  /** Ready-to-paste ChordPro directive */
  directive: string;
  provider: "youtube_api" | "watch_page";
};

function parseLengthSecondsFromWatchHtml(html: string): number | null {
  const patterns = [
    /"lengthSeconds"\s*:\s*"(\d+)"/,
    /"lengthSeconds"\s*:\s*(\d+)/,
    /\\?"approxDurationMs\\?"\s*:\s*\\?"(\d+)\\?"/,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const raw = Number(match[1]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    // approxDurationMs is milliseconds
    if (pattern.source.includes("approxDurationMs")) {
      const seconds = Math.round(raw / 1000);
      return seconds > 0 ? seconds : null;
    }
    return raw;
  }
  return null;
}

async function durationViaYouTubeApi(
  videoId: string,
): Promise<YouTubeDurationResult | null> {
  const key = env.youtubeApiKey;
  if (!key) return null;

  const url = new URL(YT_VIDEOS_API);
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", key);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${hintForApiStatus(res.status, body)} (${body.slice(0, 160)})`,
    );
  }

  const data = (await res.json()) as {
    items?: Array<{ contentDetails?: { duration?: string } }>;
  };
  const iso = data.items?.[0]?.contentDetails?.duration;
  if (!iso) return null;
  const durationSeconds = parseYouTubeIsoDuration(iso);
  if (!durationSeconds) return null;

  const watch = youtubeWatchUrl(videoId);
  return {
    videoId,
    url: watch,
    durationSeconds,
    duration: formatChordProDuration(durationSeconds),
    directive: `{duration: ${formatChordProDuration(durationSeconds)}}`,
    provider: "youtube_api",
  };
}

async function durationViaWatchPage(
  videoId: string,
): Promise<YouTubeDurationResult | null> {
  const watch = youtubeWatchUrl(videoId);
  const res = await fetch(watch, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; HosannaBot/1.0; +https://hosanna.live)",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`YouTube watch page returned ${res.status}`);
  }
  const html = await res.text();
  const durationSeconds = parseLengthSecondsFromWatchHtml(html);
  if (!durationSeconds) return null;

  return {
    videoId,
    url: watch,
    durationSeconds,
    duration: formatChordProDuration(durationSeconds),
    directive: `{duration: ${formatChordProDuration(durationSeconds)}}`,
    provider: "watch_page",
  };
}

/**
 * Resolve a YouTube URL/id to a ChordPro `{duration: M:SS}` value.
 * Prefers YouTube Data API when YOUTUBE_API_KEY is set; falls back to the
 * public watch page (`lengthSeconds`).
 */
export async function getYouTubeDuration(
  urlOrId: string,
): Promise<YouTubeDurationResult> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) {
    throw new Error("Invalid YouTube URL or video id.");
  }

  let apiError: string | null = null;
  if (env.youtubeApiKey) {
    try {
      const viaApi = await durationViaYouTubeApi(videoId);
      if (viaApi) return viaApi;
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err);
    }
  }

  try {
    const viaPage = await durationViaWatchPage(videoId);
    if (viaPage) return viaPage;
  } catch (err) {
    const pageError = err instanceof Error ? err.message : String(err);
    if (apiError) {
      throw new Error(
        `YouTube API failed (${apiError}); watch page also failed (${pageError})`,
      );
    }
    throw new Error(`YouTube watch page failed (${pageError})`);
  }

  if (apiError) {
    throw new Error(
      `YouTube API failed (${apiError}) and watch page had no lengthSeconds.`,
    );
  }
  throw new Error("Could not determine video duration from YouTube.");
}

function buildQuery(opts: {
  title?: string;
  artist?: string;
  query?: string;
}): string {
  if (opts.query?.trim()) return opts.query.trim();
  return [opts.title?.trim(), opts.artist?.trim()].filter(Boolean).join(" ");
}

function hintForApiStatus(status: number, body: string): string {
  if (status === 403) {
    if (/accessNotConfigured|has not been used|disabled/i.test(body)) {
      return "Enable YouTube Data API v3 on the Google Cloud project for this key.";
    }
    if (/ipRefererBlocked|IP_ADDRESS|referer/i.test(body)) {
      return "Key restriction blocked this server — allow this host IP or use an unrestricted server key.";
    }
    if (/quota|dailyLimit|rateLimit/i.test(body)) {
      return "YouTube API quota exhausted for today.";
    }
    return "YouTube API 403 — check YOUTUBE_API_KEY restrictions and that YouTube Data API v3 is enabled.";
  }
  if (status === 400) {
    return "Invalid YOUTUBE_API_KEY or request.";
  }
  return `YouTube API error ${status}.`;
}

async function searchViaYouTubeApi(
  q: string,
  limit: number,
): Promise<{ hits: YouTubeHit[]; apiNote?: string }> {
  const key = env.youtubeApiKey;
  if (!key) return { hits: [] };

  const url = new URL(YT_SEARCH_API);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(limit));
  url.searchParams.set("key", key);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${hintForApiStatus(res.status, body)} (${body.slice(0, 160)})`,
    );
  }
  const data = (await res.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        description?: string;
        publishedAt?: string;
      };
    }>;
  };

  const hits: YouTubeHit[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId;
    if (!videoId) continue;
    const watch = youtubeWatchUrl(videoId);
    hits.push({
      videoId,
      title: item.snippet?.title ?? "Untitled",
      channel: item.snippet?.channelTitle,
      url: watch,
      directive: `{youtube: ${watch}}`,
      description: item.snippet?.description?.slice(0, 240),
      publishedAt: item.snippet?.publishedAt,
    });
  }
  return { hits };
}

async function searchViaWebFallback(
  q: string,
  limit: number,
  nativeAuth?: NativeWebAuth | null,
): Promise<YouTubeHit[]> {
  // Prefer a natural-language query — `site:` often triggers DuckDuckGo's bot gate.
  // When DeepSeek Search is available, `site:youtube.com` works well.
  const query = nativeAuth
    ? `${q} site:youtube.com`.slice(0, 128)
    : `${q} youtube`;
  const web = await searchWeb({
    query,
    limit: Math.max(limit * 2, 8),
    nativeAuth,
  });
  const seen = new Set<string>();
  const hits: YouTubeHit[] = [];
  for (const r of web.results) {
    const videoId =
      extractYouTubeVideoId(r.url) ||
      extractYouTubeVideoId(r.title) ||
      extractYouTubeVideoId(r.snippet ?? "");
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const watch = youtubeWatchUrl(videoId);
    hits.push({
      videoId,
      title: r.title,
      url: watch,
      directive: `{youtube: ${watch}}`,
      description: r.snippet,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export async function searchYouTube(opts: {
  title?: string;
  artist?: string;
  query?: string;
  limit?: number;
  nativeAuth?: NativeWebAuth | null;
}): Promise<{
  hits: YouTubeHit[];
  query: string;
  provider: "youtube_api" | "web_fallback";
  note?: string;
}> {
  const query = buildQuery(opts);
  if (!query) {
    return {
      hits: [],
      query: "",
      provider: env.youtubeApiKey ? "youtube_api" : "web_fallback",
      note: "Provide title, artist, or query.",
    };
  }
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 10);
  const nativeAuth = opts.nativeAuth;

  if (env.youtubeApiKey) {
    try {
      const { hits } = await searchViaYouTubeApi(query, limit);
      return {
        hits,
        query,
        provider: "youtube_api",
        note: hits[0]
          ? `Use hits[].directive (e.g. ${hits[0].directive}) in the ChordPro header.`
          : "YouTube API returned no videos for this query.",
      };
    } catch (apiErr) {
      const apiMessage =
        apiErr instanceof Error ? apiErr.message : String(apiErr);
      try {
        const hits = await searchViaWebFallback(query, limit, nativeAuth);
        return {
          hits,
          query,
          provider: "web_fallback",
          note: hits[0]
            ? `YouTube API failed (${apiMessage}). Fell back to web search. Prefer hits[].directive.`
            : `YouTube API failed (${apiMessage}). Web search also found no youtube.com/watch links.`,
        };
      } catch (webErr) {
        const webMessage =
          webErr instanceof Error ? webErr.message : String(webErr);
        throw new Error(
          `YouTube API failed (${apiMessage}); web fallback also failed (${webMessage})`,
        );
      }
    }
  }

  const hits = await searchViaWebFallback(query, limit, nativeAuth);
  return {
    hits,
    query,
    provider: "web_fallback",
    note: hits[0]
      ? `No YOUTUBE_API_KEY in Hosanna-server/.env — used web search. Prefer hits[].directive (e.g. ${hits[0].directive}). Add the key and restart the API process.`
      : "No YOUTUBE_API_KEY in Hosanna-server/.env and web search found no youtube.com/watch links. Add YOUTUBE_API_KEY to that .env and restart the API.",
  };
}
