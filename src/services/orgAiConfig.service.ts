import { prisma } from "../database/prisma.js";
import {
  decryptSecret,
  encryptSecret,
  isAiCryptoConfigured,
} from "../lib/aiCrypto.js";
import { NATIVE_WEB_CAPABILITIES } from "../mcp/lib/nativeWebCapabilities.js";
import { AppError } from "../utils/errors.js";
import { AI_LIMITS, clampInt } from "./aiBehavior.js";

export type AiProvider =
  "openai" | "anthropic" | "google" | "deepseek" | "openai_compatible";

export const AI_PROVIDERS: AiProvider[] = [
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "openai_compatible",
];

export const AI_MODEL_PRESETS: Record<AiProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  anthropic: [
    "claude-sonnet-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5",
  ],
  google: ["gemini-2.5-flash", "gemini-2.5-pro"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai_compatible: ["gpt-4o-mini", "llama-3.3-70b", "qwen-plus"],
};

export const AI_PROVIDER_DEFAULT_BASE_URL: Partial<Record<AiProvider, string>> =
  {
    deepseek: "https://api.deepseek.com",
    openai: "https://api.openai.com/v1",
  };

function assertProvider(provider: string): asserts provider is AiProvider {
  if (!AI_PROVIDERS.includes(provider as AiProvider)) {
    throw AppError.badRequest(`Unsupported AI provider: ${provider}`);
  }
}

function normalizeBaseUrl(
  provider: AiProvider,
  raw?: string | null,
): string | null {
  const trimmed = raw?.trim() || null;
  if (provider === "openai_compatible") {
    if (!trimmed) {
      throw AppError.badRequest(
        "baseUrl is required for openai_compatible providers.",
      );
    }
  }
  if (!trimmed) {
    return AI_PROVIDER_DEFAULT_BASE_URL[provider] ?? null;
  }
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("bad protocol");
    }
  } catch {
    throw AppError.badRequest("baseUrl must be a valid http(s) URL.");
  }
  return trimmed.replace(/\/+$/, "");
}

export function publicAiSettings(
  row: {
    provider: string;
    model: string;
    enabled: boolean;
    baseUrl: string | null;
    apiKeyCiphertext: string | null;
    maxToolCalls?: number;
    temperature?: number | null;
    maxOutputTokens?: number | null;
    instructions?: string | null;
    memoryEnabled?: boolean;
  } | null,
) {
  const provider = (row?.provider as AiProvider) ?? "openai";
  const nativeWeb = NATIVE_WEB_CAPABILITIES[provider];
  return {
    provider,
    model: row?.model ?? "gpt-4o-mini",
    enabled: row?.enabled ?? false,
    configured: Boolean(row?.apiKeyCiphertext),
    baseUrl: row?.baseUrl ?? AI_PROVIDER_DEFAULT_BASE_URL[provider] ?? null,
    encryptionReady: isAiCryptoConfigured(),
    maxToolCalls: row?.maxToolCalls ?? AI_LIMITS.maxToolCalls.default,
    temperature: row?.temperature ?? null,
    maxOutputTokens: row?.maxOutputTokens ?? null,
    instructions: row?.instructions ?? "",
    memoryEnabled: row?.memoryEnabled ?? true,
    limits: AI_LIMITS,
    providers: AI_PROVIDERS,
    modelPresets: AI_MODEL_PRESETS,
    defaultBaseUrls: AI_PROVIDER_DEFAULT_BASE_URL,
    /** Per-provider: whether Hosanna can call REST Search/Fetch with the same BYOK key. */
    nativeWebCapabilities: NATIVE_WEB_CAPABILITIES,
    nativeWeb: {
      search: nativeWeb.search,
      fetch: nativeWeb.fetch,
      note: nativeWeb.note,
      active: Boolean(
        row?.enabled && row?.apiKeyCiphertext && nativeWeb.search,
      ),
    },
  };
}

export class OrgAiConfigService {
  async getPublic(orgId: string) {
    const row = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    return publicAiSettings(row);
  }

  async upsert(
    orgId: string,
    input: {
      provider?: string;
      model?: string;
      enabled?: boolean;
      apiKey?: string;
      baseUrl?: string | null;
      maxToolCalls?: number;
      temperature?: number | null;
      maxOutputTokens?: number | null;
      instructions?: string | null;
      memoryEnabled?: boolean;
    },
  ) {
    const existing = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    const provider = input.provider ?? existing?.provider ?? "openai";
    assertProvider(provider);
    const model =
      input.model?.trim() || existing?.model || AI_MODEL_PRESETS[provider][0];

    const baseUrl =
      input.baseUrl !== undefined
        ? normalizeBaseUrl(provider, input.baseUrl)
        : normalizeBaseUrl(provider, existing?.baseUrl);

    let apiKeyCiphertext = existing?.apiKeyCiphertext ?? null;
    let apiKeyIv = existing?.apiKeyIv ?? null;
    let apiKeyTag = existing?.apiKeyTag ?? null;

    if (input.apiKey != null && input.apiKey.trim() !== "") {
      if (!isAiCryptoConfigured()) {
        throw AppError.badRequest(
          "Server is missing AI_SETTINGS_ENCRYPTION_KEY; cannot store API keys.",
        );
      }
      const enc = encryptSecret(input.apiKey.trim());
      apiKeyCiphertext = enc.ciphertext;
      apiKeyIv = enc.iv;
      apiKeyTag = enc.tag;
    }

    const enabled =
      input.enabled ?? existing?.enabled ?? Boolean(apiKeyCiphertext);

    const behavior = {
      ...(input.maxToolCalls !== undefined && {
        maxToolCalls: clampInt(
          input.maxToolCalls,
          AI_LIMITS.maxToolCalls.min,
          AI_LIMITS.maxToolCalls.max,
        ),
      }),
      ...(input.temperature !== undefined && {
        temperature:
          input.temperature === null
            ? null
            : Math.min(
                AI_LIMITS.temperature.max,
                Math.max(AI_LIMITS.temperature.min, input.temperature),
              ),
      }),
      ...(input.maxOutputTokens !== undefined && {
        maxOutputTokens:
          input.maxOutputTokens === null
            ? null
            : clampInt(
                input.maxOutputTokens,
                AI_LIMITS.maxOutputTokens.min,
                AI_LIMITS.maxOutputTokens.max,
              ),
      }),
      ...(input.instructions !== undefined && {
        instructions:
          input.instructions?.trim().slice(0, AI_LIMITS.instructionsMaxChars) ||
          null,
      }),
      ...(input.memoryEnabled !== undefined && {
        memoryEnabled: input.memoryEnabled,
      }),
    };

    const row = await prisma.orgAiConfig.upsert({
      where: { orgId },
      create: {
        ...behavior,
        orgId,
        provider,
        model,
        baseUrl,
        enabled: Boolean(enabled && apiKeyCiphertext),
        apiKeyCiphertext,
        apiKeyIv,
        apiKeyTag,
      },
      update: {
        ...behavior,
        provider,
        model,
        baseUrl,
        enabled: Boolean(enabled),
        apiKeyCiphertext,
        apiKeyIv,
        apiKeyTag,
      },
    });

    return publicAiSettings(row);
  }

  async clearKey(orgId: string) {
    const row = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    if (!row) return publicAiSettings(null);
    const updated = await prisma.orgAiConfig.update({
      where: { orgId },
      data: {
        apiKeyCiphertext: null,
        apiKeyIv: null,
        apiKeyTag: null,
        enabled: false,
      },
    });
    return publicAiSettings(updated);
  }

  /**
   * Decrypt the stored API key when present. Does not require `enabled`
   * (settings / billing can still use the key while the assistant is off).
   */
  async getDecryptedApiKey(orgId: string): Promise<{
    provider: AiProvider;
    apiKey: string;
    baseUrl: string | null;
  } | null> {
    const row = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    if (!row?.apiKeyCiphertext || !row.apiKeyIv || !row.apiKeyTag) {
      return null;
    }
    assertProvider(row.provider);
    if (!isAiCryptoConfigured()) {
      throw AppError.badRequest(
        "AI_SETTINGS_ENCRYPTION_KEY is not configured.",
      );
    }
    const apiKey = decryptSecret({
      ciphertext: row.apiKeyCiphertext,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    const baseUrl = normalizeBaseUrl(row.provider, row.baseUrl);
    return { provider: row.provider, apiKey, baseUrl };
  }

  /** Load decrypted API key for server-side chat only. */
  async getRuntimeConfig(orgId: string): Promise<{
    provider: AiProvider;
    model: string;
    apiKey: string;
    baseUrl: string | null;
    maxToolCalls: number;
    temperature: number | null;
    maxOutputTokens: number | null;
    instructions: string | null;
    memoryEnabled: boolean;
  }> {
    const row = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    if (!row?.enabled) {
      throw AppError.badRequest(
        "AI assistant is disabled for this organization.",
      );
    }
    if (!row.apiKeyCiphertext || !row.apiKeyIv || !row.apiKeyTag) {
      throw AppError.badRequest("AI API key is not configured.");
    }
    assertProvider(row.provider);
    if (!isAiCryptoConfigured()) {
      throw AppError.badRequest(
        "AI_SETTINGS_ENCRYPTION_KEY is not configured.",
      );
    }
    const apiKey = decryptSecret({
      ciphertext: row.apiKeyCiphertext,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    const baseUrl = normalizeBaseUrl(row.provider, row.baseUrl);
    return {
      provider: row.provider,
      model: row.model,
      apiKey,
      baseUrl,
      maxToolCalls: clampInt(
        row.maxToolCalls,
        AI_LIMITS.maxToolCalls.min,
        AI_LIMITS.maxToolCalls.max,
      ),
      temperature: row.temperature,
      maxOutputTokens: row.maxOutputTokens,
      instructions: row.instructions,
      memoryEnabled: row.memoryEnabled,
    };
  }
}
