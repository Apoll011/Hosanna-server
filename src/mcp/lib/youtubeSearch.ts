/**
 * YouTube video search for populating ChordPro `{youtube: ...}` directives.
 * Prefers YouTube Data API v3 when YOUTUBE_API_KEY is set; otherwise falls
 * back to web search restricted to youtube.com.
 */

import { env } from "../../config/env.js";
import { searchWeb } from "./webSearch.js";

const YT_API = "https://www.googleapis.com/youtube/v3/search";
const VIDEO_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

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

function buildQuery(opts: {
  title?: string;
  artist?: string;
  query?: string;
}): string {
  if (opts.query?.trim()) return opts.query.trim();
  return [opts.title?.trim(), opts.artist?.trim()].filter(Boolean).join(" ");
}

async function searchViaYouTubeApi(
  q: string,
  limit: number,
): Promise<YouTubeHit[]> {
  const key = env.youtubeApiKey;
  if (!key) return [];

  const url = new URL(YT_API);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", String(limit));
  url.searchParams.set("key", key);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
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
    const url = youtubeWatchUrl(videoId);
    hits.push({
      videoId,
      title: item.snippet?.title ?? "Untitled",
      channel: item.snippet?.channelTitle,
      url,
      directive: `{youtube: ${url}}`,
      description: item.snippet?.description?.slice(0, 240),
      publishedAt: item.snippet?.publishedAt,
    });
  }
  return hits;
}

async function searchViaWebFallback(
  q: string,
  limit: number,
): Promise<YouTubeHit[]> {
  const web = await searchWeb({
    query: `${q} site:youtube.com/watch`,
    limit: Math.max(limit * 2, 8),
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
    const url = youtubeWatchUrl(videoId);
    hits.push({
      videoId,
      title: r.title,
      url,
      directive: `{youtube: ${url}}`,
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

  if (env.youtubeApiKey) {
    const hits = await searchViaYouTubeApi(query, limit);
    return {
      hits,
      query,
      provider: "youtube_api",
      note: hits[0]
        ? `Use hits[].directive (e.g. ${hits[0].directive}) in the ChordPro header.`
        : undefined,
    };
  }

  const hits = await searchViaWebFallback(query, limit);
  return {
    hits,
    query,
    provider: "web_fallback",
    note: hits[0]
      ? `No YOUTUBE_API_KEY — used DuckDuckGo web search. Prefer hits[].directive (e.g. ${hits[0].directive}). Set YOUTUBE_API_KEY for better results.`
      : "No YOUTUBE_API_KEY and DuckDuckGo found no youtube.com/watch links. Set YOUTUBE_API_KEY for reliable YouTube search.",
  };
}
