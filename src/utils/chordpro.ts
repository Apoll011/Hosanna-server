export interface SongMetadata {
  title?: string;
  artist?: string;
  key?: string;
  capo?: string;
  album?: string;
  tags?: string[];
  [key: string]: string | string[] | undefined;
}

export function parseChordProMetadata(content: string): SongMetadata {
  const metadata: SongMetadata = {
    tags: [],
  };

  const lines = content.split(/\r?\n/);
  const directiveRegex = /^\{(\w+):\s*(.*)\}$/;

  for (const line of lines) {
    const match = line.trim().match(directiveRegex);
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();

      if (key === "t" || key === "title") {
        metadata.title = value;
      } else if (key === "st" || key === "subtitle" || key === "artist") {
        metadata.artist = value;
      } else if (key === "key") {
        metadata.key = value;
      } else if (key === "capo") {
        metadata.capo = value;
      } else if (key === "album") {
        metadata.album = value;
      } else if (key === "tag" || key === "tags") {
        metadata.tags?.push(...value.split(",").map((t) => t.trim()));
      } else {
        metadata[key] = value;
      }
    }
  }

  return metadata;
}
