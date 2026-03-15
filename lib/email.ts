/**
 * Partner request email notifications.
 * Uses optional SMTP env vars; if not set, no email is sent (request is still saved to DB).
 */

import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export type PartnerRequestPayload = {
  requestType: "AGENT" | "DISTRIBUTOR";
  name: string;
  governorate: string;
  phone: string;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  websiteUrl?: string | null;
  otherUrl?: string | null;
};

const TO_EMAIL = env.PARTNER_NOTIFICATION_EMAIL ?? "info@nilekingscotton.com";

function buildTextBody(p: PartnerRequestPayload): string {
  const typeLabel = p.requestType === "AGENT" ? "وكيل أونلاين" : "موزع أونلاين";
  const lines = [
    `نوع الطلب: طلب تسجيل ${typeLabel}`,
    `الاسم: ${p.name}`,
    `المحافظة: ${p.governorate}`,
    `رقم التليفون: ${p.phone}`,
  ];
  if (p.facebookUrl?.trim()) lines.push(`Facebook: ${p.facebookUrl.trim()}`);
  if (p.instagramUrl?.trim()) lines.push(`Instagram: ${p.instagramUrl.trim()}`);
  if (p.tiktokUrl?.trim()) lines.push(`TikTok: ${p.tiktokUrl.trim()}`);
  if (p.youtubeUrl?.trim()) lines.push(`YouTube: ${p.youtubeUrl.trim()}`);
  if (p.websiteUrl?.trim()) lines.push(`Website: ${p.websiteUrl.trim()}`);
  if (p.otherUrl?.trim()) lines.push(`Other: ${p.otherUrl.trim()}`);
  return lines.join("\n");
}

export async function sendPartnerRequestNotification(
  payload: PartnerRequestPayload
): Promise<{ sent: boolean; error?: string }> {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  if (!host?.trim() || !port?.trim()) {
    return { sent: false };
  }

  const subject =
    payload.requestType === "AGENT"
      ? "طلب تسجيل وكيل أونلاين جديد - Nile Kings"
      : "طلب تسجيل موزع أونلاين جديد - Nile Kings";
  const text = buildTextBody(payload);

  try {
    const secure = env.SMTP_SECURE === "true";
    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: parseInt(port, 10) || 587,
      secure,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
    const from = env.SMTP_FROM ?? `noreply@${host.split(".")[0] ?? "nilekings"}.com`;
    await transporter.sendMail({
      from,
      to: TO_EMAIL,
      subject,
      text,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendPartnerRequestNotification failed:", message);
    return { sent: false, error: message };
  }
}
