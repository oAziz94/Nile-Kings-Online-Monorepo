/**
 * Partner request email notifications.
 * Uses Resend when configured, otherwise falls back to optional SMTP.
 * If neither provider is configured, no email is sent (request is still saved to DB).
 */

import nodemailer from "nodemailer";
import { Resend } from "resend";
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
  const subject =
    payload.requestType === "AGENT"
      ? "طلب تسجيل وكيل أونلاين جديد - Nile Kings"
      : "طلب تسجيل موزع أونلاين جديد - Nile Kings";
  const text = buildTextBody(payload);

  const resendApiKey = env.RESEND_API_KEY?.trim();
  const resendFromEmail = env.RESEND_FROM_EMAIL?.trim();
  const resendFromName = env.RESEND_FROM_NAME?.trim() || "Nile Kings Cotton";

  if (resendApiKey && resendFromEmail) {
    try {
      console.info("[email] sending partner request notification via resend", {
        from: `${resendFromName} <${resendFromEmail}>`,
        to: TO_EMAIL,
      });
      const resend = new Resend(resendApiKey);
      const result = await resend.emails.send({
        from: `${resendFromName} <${resendFromEmail}>`,
        to: TO_EMAIL,
        subject,
        text,
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      console.info("[email] sent partner request notification via resend", {
        id: result.data?.id,
      });
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[email] resend sendPartnerRequestNotification failed:", message);
      return { sent: false, error: message };
    }
  }

  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  if (!host?.trim() || !port?.trim()) {
    console.warn("[email] skipped: RESEND not configured and SMTP_HOST or SMTP_PORT is not configured");
    return { sent: false };
  }

  try {
    const secure = env.SMTP_SECURE === "true";
    const fromAddress = env.SMTP_EMAIL ?? env.SMTP_FROM ?? `noreply@${host.split(".")[0] ?? "nilekings"}.com`;
    const fromName = env.SMTP_FROM_NAME ?? "Nile Kings Cotton";
    console.info("[email] sending partner request notification", {
      host: host.trim(),
      port: parseInt(port, 10) || 587,
      secure,
      hasAuth: Boolean(env.SMTP_USER && env.SMTP_PASS),
      fromAddress,
      to: TO_EMAIL,
    });

    const transporter = nodemailer.createTransport({
      host: host.trim(),
      port: parseInt(port, 10) || 587,
      secure,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
    const result = await transporter.sendMail({
      from: {
        name: fromName,
        address: fromAddress,
      },
      to: TO_EMAIL,
      subject,
      text,
    });
    console.info("[email] sent partner request notification", {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] sendPartnerRequestNotification failed:", message);
    return { sent: false, error: message };
  }
}
