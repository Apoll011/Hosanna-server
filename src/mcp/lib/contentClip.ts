/** Max ChordPro body returned when includeContent is true on search/list. */
export const SEARCH_CONTENT_MAX = 8_000;
/** Max body returned from get/get_many full content. */
export const FULL_CONTENT_MAX = 100_000;

export function clipContent(
  content: string,
  max: number = FULL_CONTENT_MAX,
): {
  content: string;
  truncated: boolean;
  contentLength: number;
} {
  const contentLength = content.length;
  if (contentLength <= max) {
    return { content, truncated: false, contentLength };
  }
  return {
    content: content.slice(0, max),
    truncated: true,
    contentLength,
  };
}
