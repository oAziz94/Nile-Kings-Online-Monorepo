/**
 * AES-256-GCM encrypt/decrypt and SHA-256 fingerprint for senior national ID.
 * ENCRYPTION_KEY must be 64 hex chars (32 bytes).
 */

import { env } from "@/lib/env";

const ALG = "AES-GCM";
const IV_LENGTH = 12;
const TAG_LENGTH = 128;
const KEY_LENGTH = 256;

async function getKey(): Promise<CryptoKey> {
  const hex = env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("ENCRYPTION_KEY is missing or invalid (set 64 hex chars in .env for senior verification)");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: ALG, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt plaintext (national ID string); returns base64 iv:ciphertext. */
export async function encryptNationalId(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: ALG, iv, tagLength: TAG_LENGTH },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return Buffer.from(combined).toString("base64");
}

/** Decrypt (for internal use only; never expose to API). */
export async function decryptNationalId(b64: string): Promise<string> {
  const key = await getKey();
  const combined = Buffer.from(b64, "base64");
  const iv = combined.subarray(0, IV_LENGTH);
  const cipher = combined.subarray(IV_LENGTH);
  const dec = await crypto.subtle.decrypt(
    { name: ALG, iv, tagLength: TAG_LENGTH },
    key,
    cipher
  );
  return new TextDecoder().decode(dec);
}

/** SHA-256 fingerprint of raw national ID (hex) for uniqueness. */
export async function nationalIdFingerprint(rawId: string): Promise<string> {
  const normalized = rawId.replace(/\D/g, "").slice(0, 14);
  const bytes = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
