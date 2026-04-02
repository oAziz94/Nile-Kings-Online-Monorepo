#!/usr/bin/env tsx
/**
 * One-off backfill script for partner request notification emails.
 *
 * Sends notification emails for stored PartnerRequest rows via Resend with an interval
 * between each email, then marks successful rows in `notes` to avoid duplicate sends.
 *
 * Usage examples:
 *   npm run backfill:partner-requests-emails
 *   npm run backfill:partner-requests-emails -- --interval-ms=3000 --limit=50
 *   npm run backfill:partner-requests-emails -- --dry-run
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, PartnerRequestType } from "@prisma/client";
import { Resend } from "resend";

const MARKER_PREFIX = "[email-backfill-sent:";

function loadEnvFromRootFile() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = join(__dirname, "..");
  const envPath = join(root, ".env");

  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function parseArgs(argv: string[]) {
  const opts = {
    intervalMs: 2500,
    limit: undefined as number | undefined,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (arg.startsWith("--interval-ms=")) {
      const v = Number(arg.slice("--interval-ms=".length));
      if (Number.isFinite(v) && v >= 0) opts.intervalMs = v;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const v = Number(arg.slice("--limit=".length));
      if (Number.isFinite(v) && v > 0) opts.limit = Math.floor(v);
      continue;
    }
  }

  return opts;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTextBody(p: {
  requestType: PartnerRequestType;
  name: string;
  governorate: string;
  phone: string;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  websiteUrl: string | null;
  otherUrl: string | null;
}) {
  const typeLabel =
    p.requestType === PartnerRequestType.AGENT
      ? "وكيل أونلاين"
      : "موزع أونلاين";

  const lines = [
    `نوع الطلب: طلب تسجيل ${typeLabel}`,
    `الاسم: ${p.name}`,
    `المحافظة: ${p.governorate}`,
    `رقم التليفون: ${p.phone}`,
  ];

  if (p.facebookUrl?.trim()) lines.push(`Facebook: ${p.facebookUrl.trim()}`);
  if (p.instagramUrl?.trim())
    lines.push(`Instagram: ${p.instagramUrl.trim()}`);
  if (p.tiktokUrl?.trim()) lines.push(`TikTok: ${p.tiktokUrl.trim()}`);
  if (p.youtubeUrl?.trim()) lines.push(`YouTube: ${p.youtubeUrl.trim()}`);
  if (p.websiteUrl?.trim()) lines.push(`Website: ${p.websiteUrl.trim()}`);
  if (p.otherUrl?.trim()) lines.push(`Other: ${p.otherUrl.trim()}`);

  return lines.join("\n");
}

function buildSubject(requestType: PartnerRequestType) {
  return requestType === PartnerRequestType.AGENT
    ? "طلب تسجيل وكيل أونلاين جديد - Nile Kings"
    : "طلب تسجيل موزع أونلاين جديد - Nile Kings";
}

async function main() {
  loadEnvFromRootFile();
  const opts = parseArgs(process.argv.slice(2));

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  const resendFromName =
    process.env.RESEND_FROM_NAME?.trim() || "Nile Kings Cotton";
  const toEmail =
    process.env.PARTNER_NOTIFICATION_EMAIL?.trim() ||
    "info@nilekingscotton.com";

  if (!resendApiKey || !resendFromEmail) {
    console.error(
      "Missing RESEND_API_KEY or RESEND_FROM_EMAIL. Configure them in .env first."
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const resend = new Resend(resendApiKey);

  try {
    const candidates = await prisma.partnerRequest.findMany({
      where: {
        OR: [{ notes: null }, { notes: { not: { contains: MARKER_PREFIX } } }],
      },
      orderBy: { createdAt: "asc" },
      ...(opts.limit ? { take: opts.limit } : {}),
    });

    if (candidates.length === 0) {
      console.log("No partner requests found that need backfill emailing.");
      return;
    }

    console.log(
      `Found ${candidates.length} requests to process. intervalMs=${opts.intervalMs}, dryRun=${opts.dryRun}`
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const req = candidates[i];
      const index = i + 1;
      const label = `${index}/${candidates.length}`;

      if ((req.notes ?? "").includes(MARKER_PREFIX)) {
        skipped += 1;
        console.log(`[${label}] skipped ${req.id} (already marked sent)`);
        continue;
      }

      const subject = buildSubject(req.requestType);
      const text = buildTextBody(req);

      if (opts.dryRun) {
        skipped += 1;
        console.log(`[${label}] dry-run ${req.id} -> would send "${subject}"`);
      } else {
        try {
          const result = await resend.emails.send({
            from: `${resendFromName} <${resendFromEmail}>`,
            to: toEmail,
            subject,
            text,
          });

          if (result.error) throw new Error(result.error.message);

          const marker = `${MARKER_PREFIX}${new Date().toISOString()}]`;
          const nextNotes = req.notes?.trim()
            ? `${req.notes}\n${marker}`
            : marker;

          await prisma.partnerRequest.update({
            where: { id: req.id },
            data: { notes: nextNotes },
          });

          sent += 1;
          console.log(
            `[${label}] sent ${req.id} (resendId=${result.data?.id ?? "n/a"})`
          );
        } catch (err) {
          failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${label}] failed ${req.id}: ${message}`);
        }
      }

      if (index < candidates.length && opts.intervalMs > 0) {
        await sleep(opts.intervalMs);
      }
    }

    console.log("\nBackfill finished:");
    console.log(`- Sent: ${sent}`);
    console.log(`- Failed: ${failed}`);
    console.log(`- Skipped: ${skipped}`);

    if (failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Backfill script failed:", err);
  process.exit(1);
});
