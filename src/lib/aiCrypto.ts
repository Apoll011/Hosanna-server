import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function encryptionKey(): Buffer {
  const raw = env.aiSettingsEncryptionKey;
  if (!raw) {
    throw new Error(
      "AI_SETTINGS_ENCRYPTION_KEY is not configured. Set a 32-byte secret (64 hex chars or base64).",
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  try {
    const asBuf = Buffer.from(raw, "base64");
    if (asBuf.length === 32) return asBuf;
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw).digest();
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = encryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret(parts: EncryptedSecret): string {
  const key = encryptionKey();
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(parts.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parts.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(parts.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isAiCryptoConfigured(): boolean {
  return Boolean(env.aiSettingsEncryptionKey);
}
