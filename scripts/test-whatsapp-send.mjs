#!/usr/bin/env node
/**
 * Test sending a WhatsApp message via Meta Cloud API.
 * Usage: node scripts/test-whatsapp-send.mjs <phone>
 * Example: node scripts/test-whatsapp-send.mjs 01012345678
 *
 * Requires .env (or env) with WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN.
 * WHATSAPP_API_URL defaults to https://graph.facebook.com/v18.0
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      process.env[key] = val;
    }
  }
}

const phone = process.argv[2]?.trim();
if (!phone) {
  console.error("Usage: node scripts/test-whatsapp-send.mjs <phone>");
  console.error("Example: node scripts/test-whatsapp-send.mjs 01012345678");
  process.exit(1);
}

function normalizePhoneForWhatsApp(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("01") && digits.length === 11) return "20" + digits;
  if (digits.startsWith("20") && digits.length >= 11) return digits;
  return digits.length > 0 ? (digits.startsWith("20") ? digits : "20" + digits) : phone.replace(/^\+/, "");
}

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const apiUrl = (process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v18.0").replace(/\/$/, "");

if (!phoneNumberId || !accessToken) {
  console.error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in .env");
  process.exit(1);
}

const to = normalizePhoneForWhatsApp(phone);
const body = "رسالة اختبار من ملوك النيل – Meta WhatsApp Cloud API.";
const url = `${apiUrl}/${phoneNumberId}/messages`;
const payload = {
  messaging_product: "whatsapp",
  to,
  type: "text",
  text: { body },
};

console.log("Sending to normalized:", to);
console.log("URL:", url);

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
if (!res.ok) {
  console.error("Error:", res.status, text);
  process.exit(1);
}
console.log("OK:", text);
