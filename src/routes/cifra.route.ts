import { Router } from "express";
import { z } from "zod";
import { assertUser } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const cifraRouter = Router();

interface SongResult {
  source: "cifraclub" | "ultimate-guitar";
  source_url: string;
  name?: string;
  artist?: string;
  youtube_url?: string;
  cifra?: string;
  error?: string;
}

interface JsonLdSong {
  "@type"?: string | string[];
  name?: string;
  byArtist?:
    | {
        name?: string;
      }
    | string;
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/131.0.0.0 Safari/537.36";

const importSchema = z.object({
  url: z.string().url(),
});

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function extractMeta(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return decodeHtml(match[1].trim());
    }
  }

  return undefined;
}

function extractJsonLd(html: string): JsonLdSong | undefined {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
  );

  if (!scripts) return undefined;

  for (const script of scripts) {
    const json = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const parsed = JSON.parse(json);

      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.["@graph"])
          ? parsed["@graph"]
          : [parsed];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        const type = item["@type"];

        const isSong =
          type === "MusicRecording" ||
          type === "MusicComposition" ||
          type === "CreativeWork" ||
          (Array.isArray(type) &&
            type.some((t) =>
              ["MusicRecording", "MusicComposition", "CreativeWork"].includes(
                t,
              ),
            ));

        if (isSong) {
          return item;
        }
      }
    } catch {
      // Ignore invalid JSON-LD.
    }
  }

  return undefined;
}

function extractYouTubeUrl(html: string): string | undefined {
  const patterns = [
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/vi\/([a-zA-Z0-9_-]{11})\//,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return `https://www.youtube.com/watch?v=${match[1]}`;
    }
  }

  return undefined;
}

function detectSource(url: URL): SongResult["source"] | undefined {
  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "cifraclub.com.br" ||
    hostname.endsWith(".cifraclub.com.br")
  ) {
    return "cifraclub";
  }

  if (
    hostname === "ultimate-guitar.com" ||
    hostname === "tabs.ultimate-guitar.com" ||
    hostname.endsWith(".ultimate-guitar.com")
  ) {
    return "ultimate-guitar";
  }

  return undefined;
}

function extractTitleArtist(html: string, source: SongResult["source"]) {
  const jsonLd = extractJsonLd(html);

  let name: string | undefined;
  let artist: string | undefined;

  if (jsonLd?.name) {
    name = jsonLd.name;
  }

  if (typeof jsonLd?.byArtist === "string") {
    artist = jsonLd.byArtist;
  } else if (jsonLd?.byArtist && typeof jsonLd.byArtist === "object") {
    artist = jsonLd.byArtist.name;
  }

  const ogTitle = extractMeta(html, "og:title");

  if (!name && ogTitle) {
    if (source === "cifraclub") {
      const match = ogTitle.match(/^(.+?)\s*-\s*Cifra Club/i);

      name = match?.[1]?.trim() ?? ogTitle;
    } else {
      const match = ogTitle.match(/^(.+?)\s*by\s+(.+?)(?:\s*[-|].*)?$/i);

      if (match) {
        name = match[1].trim();
        artist = artist ?? match[2].trim();
      } else {
        name = ogTitle;
      }
    }
  }

  if (!name) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

    if (title) {
      const cleanTitle = stripHtml(title);

      if (source === "cifraclub") {
        const match = cleanTitle.match(/^(.+?)\s*-\s*Cifra Club/i);
        name = match?.[1]?.trim() ?? cleanTitle;
      } else {
        const match = cleanTitle.match(/^(.+?)\s+by\s+(.+?)(?:\s*[-|].*)?$/i);

        if (match) {
          name = match[1].trim();
          artist = artist ?? match[2].trim();
        } else {
          name = cleanTitle;
        }
      }
    }
  }

  return { name, artist };
}

function extractCifraClub(html: string): string | undefined {
  // Cifra Club's actual chord content can change markup,
  // so keep several fallbacks.

  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);

  if (pre?.[1]) {
    return stripHtml(pre[1]);
  }

  const cifra = html.match(
    /<div[^>]+class=["'][^"']*(?:cifra|tablatura)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  );

  if (cifra?.[1]) {
    return stripHtml(cifra[1]);
  }

  return undefined;
}

function extractUltimateGuitar(html: string): string | undefined {
  const patterns = [
    /"content"\s*:\s*"((?:\\.|[^"\\])*)"/g,
    /"tab_view"\s*:\s*"((?:\\.|[^"\\])*)"/g,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);

    if (!match?.[1]) continue;

    try {
      const content = JSON.parse(`"${match[1]}"`);

      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }
    } catch {
      // Continue with next strategy.
    }
  }

  return undefined;
}

async function fetchSong(url: URL): Promise<SongResult> {
  const source = detectSource(url);

  if (!source) {
    throw new Error(
      "Unsupported source. Supported sources: Cifra Club and Ultimate Guitar.",
    );
  }

  const result: SongResult = {
    source,
    source_url: url.toString(),
  };

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page (Status ${response.status})`);
  }

  const html = await response.text();

  const metadata = extractTitleArtist(html, source);

  result.name = metadata.name;
  result.artist = metadata.artist;
  result.youtube_url = extractYouTubeUrl(html);

  result.cifra =
    source === "cifraclub"
      ? extractCifraClub(html)
      : extractUltimateGuitar(html);

  return result;
}

/**
 * GET /api/cifra?url=https://...
 */
cifraRouter.get(
  "/",
  assertUser,
  validate({ query: importSchema }),
  asyncHandler(async (req, res) => {
    const { url: target } = req.query as z.infer<typeof importSchema>;

    let url: URL;

    try {
      url = new URL(target);
    } catch {
      return res.status(400).json({
        error: "Invalid url",
      });
    }

    if (!detectSource(url)) {
      return res.status(400).json({
        error:
          "Unsupported source. Supported sources: Cifra Club and Ultimate Guitar.",
      });
    }

    try {
      const result = await fetchSong(url);

      return res
        .set("Cache-Control", "public, max-age=300, s-maxage=3600")
        .json(result);
    } catch (error) {
      const result: SongResult = {
        source: detectSource(url)!,
        source_url: url.toString(),
        error:
          error instanceof Error
            ? error.message
            : "Error fetching song details",
      };

      return res.status(502).json(result);
    }
  }),
);
