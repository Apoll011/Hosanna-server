import { prisma } from "../database/prisma.js";
import {
  decryptSecret,
  encryptSecret,
  isAiCryptoConfigured,
} from "../lib/aiCrypto.js";
import { AppError } from "../utils/errors.js";

export type AiProvider = "openai" | "anthropic" | "google";

export const AI_PROVIDERS: AiProvider[] = ["openai", "anthropic", "google"];

export const AI_MODEL_PRESETS: Record<AiProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
  anthropic: [
    "claude-sonnet-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-5",
  ],
  google: ["gemini-2.5-flash", "gemini-2.5-pro"],
};

function assertProvider(provider: string): asserts provider is AiProvider {
  if (!AI_PROVIDERS.includes(provider as AiProvider)) {
    throw AppError.badRequest(`Unsupported AI provider: ${provider}`);
  }
}

export function publicAiSettings(row: {
  provider: string;
  model: string;
  enabled: boolean;
  apiKeyCiphertext: string | null;
} | null) {
  return {
    provider: (row?.provider as AiProvider) ?? "openai",
    model: row?.model ?? "gpt-4o-mini",
    enabled: row?.enabled ?? false,
    configured: Boolean(row?.apiKeyCiphertext),
    encryptionReady: isAiCryptoConfigured(),
    providers: AI_PROVIDERS,
    modelPresets: AI_MODEL_PRESETS,
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
    },
  ) {
    const existing = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    const provider = input.provider ?? existing?.provider ?? "openai";
    assertProvider(provider);
    const model =
      input.model?.trim() ||
      existing?.model ||
      AI_MODEL_PRESETS[provider][0];

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
      input.enabled ??
      existing?.enabled ??
      Boolean(apiKeyCiphertext);

    const row = await prisma.orgAiConfig.upsert({
      where: { orgId },
      create: {
        orgId,
        provider,
        model,
        enabled: Boolean(enabled && apiKeyCiphertext),
        apiKeyCiphertext,
        apiKeyIv,
        apiKeyTag,
      },
      update: {
        provider,
        model,
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

  /** Load decrypted API key for server-side chat only. */
  async getRuntimeConfig(orgId: string): Promise<{
    provider: AiProvider;
    model: string;
    apiKey: string;
  }> {
    const row = await prisma.orgAiConfig.findUnique({ where: { orgId } });
    if (!row?.enabled) {
      throw AppError.badRequest("AI assistant is disabled for this organization.");
    }
    if (!row.apiKeyCiphertext || !row.apiKeyIv || !row.apiKeyTag) {
      throw AppError.badRequest("AI API key is not configured.");
    }
    assertProvider(row.provider);
    if (!isAiCryptoConfigured()) {
      throw AppError.badRequest("AI_SETTINGS_ENCRYPTION_KEY is not configured.");
    }
    const apiKey = decryptSecret({
      ciphertext: row.apiKeyCiphertext,
      iv: row.apiKeyIv,
      tag: row.apiKeyTag,
    });
    return { provider: row.provider, model: row.model, apiKey };
  }
}
