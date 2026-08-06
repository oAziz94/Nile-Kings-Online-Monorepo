/**
 * WhatsApp service for partner notifications.
 * Uses WaPilot text messages; failures are returned to callers and must not fail order creation.
 */

import { normalizeEgyptMobilePhoneForWhatsApp } from "@/lib/phone";

export type SendResult = { ok: true } | { ok: false; error: string };

export interface IWhatsAppService {
  sendOrderAssignment(phone: string, message: string): Promise<SendResult>;
  sendTemplate(phone: string, templateName: string, languageCode: string, bodyParams: string[]): Promise<SendResult>;
}

const DEFAULT_WAPILOT_API_URL = "https://api.wapilot.net/api/v2";

export function normalizePhoneForWhatsApp(phone: string): string {
  const normalized = normalizeEgyptMobilePhoneForWhatsApp(phone);
  return normalized ? `${normalized}@c.us` : "";
}

function getConfig(): {
  instanceId: string;
  apiToken: string;
  apiUrl: string;
} | null {
  const instanceId = process.env.WAPILOT_INSTANCE_ID?.trim();
  const apiToken = process.env.WAPILOT_API_TOKEN?.trim();
  if (!instanceId || !apiToken) return null;
  const apiUrl = (process.env.WAPILOT_API_URL ?? DEFAULT_WAPILOT_API_URL).replace(/\/$/, "");
  return { instanceId, apiToken, apiUrl };
}

class WaPilotWhatsAppService implements IWhatsAppService {
  constructor(private config: { instanceId: string; apiToken: string; apiUrl: string }) {}

  private async sendText(phone: string, message: string, idempotencyKey?: string): Promise<SendResult> {
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
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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

  async sendOrderAssignment(phone: string, message: string): Promise<SendResult> {
    return this.sendText(phone, message, `order-assignment-${Date.now()}`);
  }

  async sendTemplate(
    phone: string,
    _templateName: string,
    _languageCode: string,
    bodyParams: string[]
  ): Promise<SendResult> {
    return this.sendText(phone, bodyParams.join("\n\n"), `order-template-${Date.now()}`);
  }
}

class NoopWhatsAppService implements IWhatsAppService {
  async sendOrderAssignment(): Promise<SendResult> {
    return { ok: false, error: "WhatsApp not configured (WAPILOT_INSTANCE_ID or WAPILOT_API_TOKEN missing)" };
  }
  async sendTemplate(): Promise<SendResult> {
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
