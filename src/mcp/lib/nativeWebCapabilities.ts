/**
 * Which Studio AI providers expose REST Search/Fetch Hosanna can call with BYOK.
 * (Separate from nativeWeb.ts to avoid circular imports with orgAiConfig.)
 */

import type { AiProvider } from "../../services/orgAiConfig.service.js";

export type NativeWebCapability = {
  search: boolean;
  fetch: boolean;
  /** Human-readable note for settings UI / tool descriptions */
  note: string;
};

export const NATIVE_WEB_CAPABILITIES: Record<AiProvider, NativeWebCapability> =
  {
    deepseek: {
      search: true,
      fetch: true,
      note: "Uses DeepSeek Search & Fetch with the same org API key ($0.75 / 1k successful calls each).",
    },
    openai: {
      search: false,
      fetch: false,
      note: "OpenAI has optional in-chat web tools; Hosanna still uses DuckDuckGo / YouTube API for metadata tools.",
    },
    anthropic: {
      search: false,
      fetch: false,
      note: "Anthropic has optional in-chat web search; Hosanna metadata tools use DuckDuckGo / YouTube API.",
    },
    google: {
      search: false,
      fetch: false,
      note: "Gemini grounding is model-side; Hosanna metadata tools use DuckDuckGo / YouTube API.",
    },
    openai_compatible: {
      search: false,
      fetch: false,
      note: "Depends on the compatible host. Use provider=deepseek for DeepSeek Search & Fetch.",
    },
  };

export function providerSupportsNativeSearch(provider: AiProvider): boolean {
  return NATIVE_WEB_CAPABILITIES[provider]?.search === true;
}

export function providerSupportsNativeFetch(provider: AiProvider): boolean {
  return NATIVE_WEB_CAPABILITIES[provider]?.fetch === true;
}
