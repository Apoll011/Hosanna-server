import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("aiCrypto", () => {
  it("round-trips secrets with AES-256-GCM", async () => {
    process.env.AI_SETTINGS_ENCRYPTION_KEY = "a".repeat(64);
    // Dynamic import after env is set (module caches key via env read).
    const { encryptSecret, decryptSecret, isAiCryptoConfigured } =
      await import("../../src/lib/aiCrypto.js");
    assert.equal(isAiCryptoConfigured(), true);
    const enc = encryptSecret("sk-test-secret-value");
    assert.ok(enc.ciphertext);
    assert.ok(enc.iv);
    assert.ok(enc.tag);
    assert.equal(decryptSecret(enc), "sk-test-secret-value");
  });
});
