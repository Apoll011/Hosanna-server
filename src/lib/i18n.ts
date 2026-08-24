/**
 * Minimal server-side i18n.
 *
 * - No runtime dependencies.
 * - Canonical locale: pt-PT (loaded eagerly).
 * - Other locales loaded lazily on first use.
 * - Falls back to pt-PT when a key or locale is missing.
 * - `t(locale, key, vars?)` interpolates {{var}} placeholders.
 */

import en from "../locales/en.js";
import es from "../locales/es.js";
import type { I18nKeys } from "../locales/pt-PT.js";
import ptPT from "../locales/pt-PT.js";

// ── Registry ───────────────────────────────────────────────────────────────

/** Map of loaded locale objects. pt-PT is always present. */
const registry = new Map<string, Record<string, any>>();
registry.set("pt-PT", ptPT);
registry.set("pt-BR", ptPT);
registry.set("en-US", en);
registry.set("es-ES", es);

/** Lazy-load a locale module on first use. */
async function loadLocale(locale: string): Promise<Record<string, any>> {
  if (registry.has(locale)) return registry.get(locale)!;

  try {
    const mod = await import(`../locales/${locale}.js`);
    const data = mod.default ?? mod;
    registry.set(locale, data);
    return data;
  } catch {
    // Locale file not found — fall back to pt-PT.
    return ptPT;
  }
}

// ── Key resolution ─────────────────────────────────────────────────────────

type DotPath<T, Prefix extends string = ""> =
  T extends Record<string, unknown>
    ? {
        [K in keyof T & string]: DotPath<
          T[K],
          Prefix extends "" ? K : `${Prefix}.${K}`
        >;
      }[keyof T & string]
    : Prefix;

export type TranslationKey = DotPath<I18nKeys>;

function resolve(obj: Record<string, any>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Synchronous translation using the pre-loaded registry.
 * Falls back to pt-PT if the key is not found in the requested locale.
 *
 * @param locale  BCP-47 locale tag, e.g. "pt-PT", "en-GB".
 * @param key     Dot-separated key path, e.g. "error.not_found".
 * @param vars    Optional interpolation variables.
 */
export function t(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const data = registry.get(locale) ?? ptPT;
  const raw = resolve(data, key) ?? resolve(ptPT, key) ?? key;
  return vars ? interpolate(raw, vars) : raw;
}

/**
 * Pre-warms a locale into the registry (call at startup or on first request
 * for that locale).
 */
export async function warmLocale(locale: string): Promise<void> {
  await loadLocale(locale);
}

/** Default locale used when no org preference is set. */
export const DEFAULT_LOCALE = "pt-PT";
