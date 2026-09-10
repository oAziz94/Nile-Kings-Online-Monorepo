/**
 * WhatsApp service for account-phone OTP delivery (register / forgot-password).
 *
 * Rebuilt against WaPilot, reusing the exact API shape the old (deleted-on-main-2026-09-09,
 * unrelated cleanup) partner-notification service used — see
 * docs/redesign/04-decisions.md 2026-09-10 "WhatsApp OTP via WaPilot" and
 * `git show 445da6c~1:lib/services/whatsapp.ts` for the reference implementation this is
 * modeled on. The one real change: phone normalization now goes through
 * `normalizeAccountPhoneForWhatsApp` (all 22 account-phone dropdown countries) instead of the
 * old Egypt-only `normalizeEgyptMobilePhoneForWhatsApp` — this service has no partner-notification
 * callers anymore, only OTP send (`lib/auth/otp.ts`'s `requestOtp`).
 *
 * Graceful degradation when unconfigured (`WAPILOT_INSTANCE_ID`/`WAPILOT_API_TOKEN` unset)
 * mirrors `lib/email.ts`'s Resend/SMTP pattern: no hard crash, just an error result the caller
 * surfaces as a user-facing failure.
 */

import { env } from "@/lib/env";
import { normalizeAccountPhoneForWhatsApp } from "@/lib/phone";

export type SendResult = { ok: true } | { ok: false; error: string };

export interface IWhatsAppService {
  sendText(phone: string, message: string): Promise<SendResult>;
}

const DEFAULT_WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

/** `chat_id` = E.164 phone with the leading "+" stripped, suffixed "@c.us". */
export function normalizePhoneForWhatsApp(phone: string): string {
  const normalized = normalizeAccountPhoneForWhatsApp(phone);
  return normalized ? `${normalized}@c.us` : "";
}

function getConfig(): {
  instanceId: string;
  apiToken: string;
  apiUrl: string;
} | null {
  const instanceId = env.WAPILOT_INSTANCE_ID?.trim();
  const apiToken = env.WAPILOT_API_TOKEN?.trim();
  if (!instanceId || !apiToken) return null;
  const apiUrl = (env.WAPILOT_API_URL ?? DEFAULT_WAPILOT_API_URL).replace(/\/$/, "");
  return { instanceId, apiToken, apiUrl };
}

class WaPilotWhatsAppService implements IWhatsAppService {
  constructor(private config: { instanceId: string; apiToken: string; apiUrl: string }) {}

  async sendText(phone: string, message: string): Promise<SendResult> {
    const chatId = normalizePhoneForWhatsApp(phone);
    if (!chatId) return { ok: false, error: "رقم واتساب غير صالح" };

    try {
      const res = await fetch(
        `${this.config.apiUrl}/${encodeURIComponent(this.config.instanceId)}/send-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: this.config.apiToken,
          },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        }
      );
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          error: `WaPilot API ${res.status}: ${text.length > 200 ? text.slice(0, 200) : text}`,
        };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

class NoopWhatsAppService implements IWhatsAppService {
  async sendText(): Promise<SendResult> {
    return { ok: false, error: "WhatsApp not configured (WAPILOT_INSTANCE_ID or WAPILOT_API_TOKEN missing)" };
  }
}

let instance: IWhatsAppService | null = null;

export function getWhatsAppService(): IWhatsAppService {
  if (instance) return instance;
  const config = getConfig();
  instance = config ? new WaPilotWhatsAppService(config) : new NoopWhatsAppService();
  return instance;
}

/** Test-only escape hatch to reset the memoized singleton between test cases. */
export function __resetWhatsAppServiceForTests(): void {
  instance = null;
}
