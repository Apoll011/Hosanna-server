import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const boolFromString = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),

  SYNC_API_TOKEN: z.string().min(1).optional(),

  CORS_ORIGINS: z.string().default("*"),

  DATA_DIR: z.string().default("./data"),

  MAX_BODY_SIZE: z.string().default("50mb"),
  MAX_SONG_SIZE_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),

  SERVE_STATIC: boolFromString,
  STATIC_DIR: z.string().default("./client/dist"),

  HTTPS_ENABLED: boolFromString,
  SSL_KEY_FILE: z.string().optional(),
  SSL_CRT_FILE: z.string().optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

// In production a token MUST be provided explicitly - never fall back to a
// generated/default value that could silently differ between restarts or be
// guessed. In development, generate an ephemeral token for convenience.
let syncApiToken = env.SYNC_API_TOKEN;
if (!syncApiToken) {
  if (env.NODE_ENV === "production") {
    console.error(
      "FATAL: SYNC_API_TOKEN must be set in production. Refusing to start with an implicit token."
    );
    process.exit(1);
  }
  syncApiToken = crypto.randomBytes(24).toString("hex");
  console.warn(
    `SYNC_API_TOKEN not set. Generated a temporary development token: ${syncApiToken}`
  );
}

const dataDir = path.resolve(process.cwd(), env.DATA_DIR);

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  host: env.HOST,

  syncApiToken,

  corsOrigins:
    env.CORS_ORIGINS === "*"
      ? true
      : env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),

  dataDir,
  songsDir: path.join(dataDir, "songs"),
  servicesFile: path.join(dataDir, "services.json"),

  maxBodySize: env.MAX_BODY_SIZE,
  maxSongSizeBytes: env.MAX_SONG_SIZE_BYTES,

  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,

  serveStatic: env.SERVE_STATIC,
  staticDir: path.resolve(process.cwd(), env.STATIC_DIR),

  httpsEnabled: env.HTTPS_ENABLED,
  sslKeyFile: env.SSL_KEY_FILE ? path.resolve(process.cwd(), env.SSL_KEY_FILE) : undefined,
  sslCrtFile: env.SSL_CRT_FILE ? path.resolve(process.cwd(), env.SSL_CRT_FILE) : undefined,

  logLevel: env.LOG_LEVEL,
} as const;

export type Config = typeof config;
