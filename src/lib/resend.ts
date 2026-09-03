import { Resend } from "resend";
import { env } from "../config/env.js";

let resendClient: Resend | null = null;

/**
 * Returns the Resend client instance.
 * Lazily initializes the client using the configured RESEND_API_KEY.
 */
export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = env.resendApiKey;
    if (!apiKey) {
      console.warn(
        "[resend] RESEND_API_KEY is not set. Email sending will fail until an API key is configured.",
      );
    }
    resendClient = new Resend(apiKey || "missing_api_key");
  }
  return resendClient;
}

/**
 * Singleton Resend client instance.
 */
export const resend = getResendClient();
