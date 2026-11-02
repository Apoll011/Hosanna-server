import type { AiProvider } from "../orgAiConfig.service.js";

export type AiBalanceInfo = {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
};

export type AiBillingSupported = {
  supported: true;
  provider: "deepseek";
  kind: "balance";
  isAvailable: boolean;
  balances: AiBalanceInfo[];
  fetchedAt: string;
};

export type AiBillingUnsupported = {
  supported: false;
  provider: AiProvider;
  reason: "unsupported_provider" | "not_configured" | "disabled_crypto";
};

export type AiBillingResponse = AiBillingSupported | AiBillingUnsupported;
