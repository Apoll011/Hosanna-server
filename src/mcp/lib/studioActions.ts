/**
 * Studio-only AI action directives.
 * The Studio tab interprets these from tool output (navigate, print, sync).
 * MCP hosts can ignore them.
 */

export const STUDIO_NAVIGATE_KINDS = [
  "song",
  "service",
  "folder",
  "collection",
  "agenda",
  "songs",
  "services",
  "folders",
  "collections",
  "trash",
  "teams",
  "settings",
  "route",
] as const;

export type StudioNavigateKind = (typeof STUDIO_NAVIGATE_KINDS)[number];

export const STUDIO_PRINT_KINDS = [
  "song",
  "service",
  "folder",
  "collection",
  "event",
] as const;

export type StudioPrintKind = (typeof STUDIO_PRINT_KINDS)[number];

export function studioNavigateDirective(opts: {
  kind: StudioNavigateKind;
  id?: string | null;
  route?: string;
  reason?: string;
}) {
  return {
    studioNavigate: true as const,
    kind: opts.kind,
    id: opts.id ?? null,
    route: opts.route,
    reason: opts.reason ?? "navigate",
    note: "Studio will navigate the open tab. Not used on MCP hosts.",
  };
}

export function studioPrintDirective(opts: {
  kind: StudioPrintKind;
  ids: string[];
  title?: string;
  options?: Record<string, unknown>;
  reason?: string;
}) {
  return {
    studioPrint: true as const,
    kind: opts.kind,
    ids: opts.ids,
    title: opts.title,
    options: opts.options ?? {},
    reason: opts.reason ?? "print",
    note: "Studio will open the print/PDF modal. Not used on MCP hosts.",
  };
}
