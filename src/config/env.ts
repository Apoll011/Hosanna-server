import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    required("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: required("DATABASE_URL"),
  directUrl: required("DIRECT_URL"),
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  publicAppUrl: required("PUBLIC_APP_URL"),
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom:
    process.env.EMAIL_FROM ??
    process.env.RESEND_FROM_EMAIL ??
    "Hosanna <no-reply@hosanna.live>",
  cronSecret: process.env.CRON_SECRET,
};
