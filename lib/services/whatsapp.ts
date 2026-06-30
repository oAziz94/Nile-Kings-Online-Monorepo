/**
 * WhatsApp service for partner notifications (e.g. order assignment).
 * Uses Meta WhatsApp Cloud API. No Twilio dependency.
 */

import { normalizeEgyptMobilePhoneForWhatsApp } from "@/lib/phone";

export type SendResult = { ok: true } | { ok: false; error: string };

export interface IWhatsAppService {
  /** Send order assignment message to partner phone. Phone will be normalized for Meta API. */
  sendOrderAssignment(phone: string, message: string): Promise<SendResult>;
  /** Send pre-approved template (for business-initiated conversations). Body params passed in order. */
  sendTemplate(phone: string, templateName: string, languageCode: string, bodyParams: string[]): Promise<SendResult>;
}

const DEFAULT_WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

/**
 * Normalize phone for Meta WhatsApp Cloud API (Egypt country code 20).
 * - 010xxxxxxxx (11 digits) -> drop leading 0, add 20 -> 201001519873
 * - +2010xxxxxxxx -> 2010xxxxxxxx (strip plus)
 * - Other: digits only; add 20 if not already present.
 */
export function normalizePhoneForWhatsApp(phone: string): string {
  return normalizeEgyptMobilePhoneForWhatsApp(phone) ?? "";
}

function getConfig(): {
  phoneNumberId: string;
  accessToken: string;
  apiUrl: string;
} | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!phoneNumberId || !accessToken) return null;
  const apiUrl = (process.env.WHATSAPP_API_URL ?? DEFAULT_WHATSAPP_API_URL).replace(/\/$/, "");
  return { phoneNumberId, accessToken, apiUrl };
}

/**
 * Meta Cloud API text message payload.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
function buildTextPayload(to: string, body: string): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  };
}

/** Max length for one template body parameter (Meta limit 1024). */
const MAX_TEMPLATE_BODY_PARAM = 1000;

/**
 * Meta Cloud API template message payload (for business-initiated messages).
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
function buildTemplatePayload(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: string[]
): Record<string, unknown> {
  const parameters = bodyParams.map((text) => ({
    type: "text",
    text: text.slice(0, MAX_TEMPLATE_BODY_PARAM),
  }));
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: parameters.length ? [{ type: "body", parameters }] : [],
    },
  };
}

class MetaWhatsAppService implements IWhatsAppService {
  private config: { phoneNumberId: string; accessToken: string; apiUrl: string };

  constructor(config: { phoneNumberId: string; accessToken: string; apiUrl: string }) {
    this.config = config;
  }

  private async send(url: string, payload: Record<string, unknown>): Promise<SendResult> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      if (!res.ok) {
        let errMsg = text;
        try {
          const json = JSON.parse(text) as { error?: { message?: string } };
          if (json?.error?.message) errMsg = json.error.message;
        } catch {
          if (text.length > 200) errMsg = text.slice(0, 200) + "…";
        }
        return { ok: false, error: `WhatsApp API ${res.status}: ${errMsg}` };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  async sendOrderAssignment(phone: string, message: string): Promise<SendResult> {
    const to = normalizePhoneForWhatsApp(phone);
    if (!to) return { ok: false, error: "رقم واتساب غير صالح" };
    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;
    const payload = buildTextPayload(to, message);
    return this.send(url, payload);
  }

  async sendTemplate(
    phone: string,
    templateName: string,
    languageCode: string,
    bodyParams: string[]
  ): Promise<SendResult> {
    const to = normalizePhoneForWhatsApp(phone);
    if (!to) return { ok: false, error: "رقم واتساب غير صالح" };
    const url = `${this.config.apiUrl}/${this.config.phoneNumberId}/messages`;
    const payload = buildTemplatePayload(to, templateName, languageCode, bodyParams);
    return this.send(url, payload);
  }
}

class NoopWhatsAppService implements IWhatsAppService {
  async sendOrderAssignment(_phone: string, _message: string): Promise<SendResult> {
    return { ok: false, error: "WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN missing)" };
  }
  async sendTemplate(): Promise<SendResult> {
    return { ok: false, error: "WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN missing)" };
  }
}

let _instance: IWhatsAppService | null = null;

export function getWhatsAppService(): IWhatsAppService {
  if (_instance) return _instance;
  const config = getConfig();
  if (config) {
    _instance = new MetaWhatsAppService(config);
  } else {
    _instance = new NoopWhatsAppService();
  }
  return _instance;
}
