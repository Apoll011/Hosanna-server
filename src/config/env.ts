import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  // ── Server ──────────────────────────────────────────────────────────────
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  /** Set DEV_MODE=true in .env to use sameSite: None cookies locally. */
  devMode: process.env.DEV_MODE === "true",

  // ── Database ─────────────────────────────────────────────────────────────
  databaseUrl: required("DATABASE_URL"),
  /** Max connections in the pg pool. Defaults to 20. */
  dbPoolMax: parseInt(process.env.DB_POOL_MAX ?? "20", 10),

  // ── Better Auth ──────────────────────────────────────────────────────────
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  publicAppUrl: required("PUBLIC_APP_URL"),
  /** Sentinel plugin API key — required in production. */
  betterAuthApiKey: optional("BETTER_AUTH_API_KEY"),

  // ── OAuth providers ───────────────────────────────────────────────────────
  googleClientId: required("GOOGLE_CLIENT_ID"),
  googleClientSecret: required("GOOGLE_CLIENT_SECRET"),

  // ── Stripe ────────────────────────────────────────────────────────────────
  stripeSecretKey: required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),

  // ── Captcha ───────────────────────────────────────────────────────────────
  turnstileSecretKey: required("TURNSTILE_SECRET_KEY"),

  // ── Supabase ──────────────────────────────────────────────────────────────
  supabaseUrl: required("SUPABASE_URL"),
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),

  // ── Email (Resend) ────────────────────────────────────────────────────────
  resendApiKey: required("RESEND_API_KEY"),
  emailFrom:
    process.env.EMAIL_FROM ?? "Hosanna <no-reply@hosanna.live>",

  // ── Studio URL ────────────────────────────────────────────────────────────
  /** The front-end app URL used to build email links. */
  studioUrl: process.env.STUDIO_URL ?? "https://studio.hosanna.live",

  // ── Cron ──────────────────────────────────────────────────────────────────
  cronSecret: optional("CRON_SECRET"),
};
