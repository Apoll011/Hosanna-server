import { isAiCryptoConfigured } from "../../lib/aiCrypto.js";
import {
  OrgAiConfigService,
  type AiProvider,
} from "../orgAiConfig.service.js";
import { fetchDeepSeekBalance } from "./deepseekBalance.js";
import type { AiBillingResponse } from "./types.js";

export type { AiBillingResponse, AiBalanceInfo } from "./types.js";

const config = new OrgAiConfigService();

export async function getOrgAiBilling(
  orgId: string,
): Promise<AiBillingResponse> {
  const publicSettings = await config.getPublic(orgId);
  const provider = publicSettings.provider as AiProvider;

  if (!isAiCryptoConfigured()) {
    return { supported: false, provider, reason: "disabled_crypto" };
  }

  const creds = await config.getDecryptedApiKey(orgId);
  if (!creds) {
    return { supported: false, provider, reason: "not_configured" };
  }

  if (creds.provider !== "deepseek") {
    return {
      supported: false,
      provider: creds.provider,
      reason: "unsupported_provider",
    };
  }

  return fetchDeepSeekBalance({
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
  });
}
