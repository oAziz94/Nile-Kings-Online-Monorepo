import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiInternal } from "@/lib/api/response";

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with "file" (image) or JSON { image: base64 }
 * Returns { url } for Cloudinary. If Cloudinary not configured, returns 501.
 *
 * Backlog 9.8a (b): every upload made through the site is registered as a `MediaAsset` row
 * at upload time (id, Cloudinary's `public_id`, `secure_url`, width/height/bytes/format,
 * folder) — the response gains `assetId`/`publicId` additively; every existing caller keeps
 * working on `url` alone (`components/admin/image-upload.tsx` unchanged). Proof uploads
 * (`nile-kings/routed-proofs`) register too; the folder is what the الصور library filters on
 * to keep products default.
 */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: "NOT_CONFIGURED", message: "Cloudinary غير مضبوط" },
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  let imageData: string; // base64
  let contentType = "image/jpeg";
  let folderOverride: string | undefined;

  const contentTypeHeader = req.headers.get("content-type") ?? "";
  if (contentTypeHeader.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.image !== "string") return apiBadRequest("يجب إرسال image (base64)");
    imageData = body.image.replace(/^data:image\/\w+;base64,/, "");
    if (body.contentType) contentType = body.contentType;
    if (body.folder === "proofs" || body.folder === "routed-proofs") folderOverride = "nile-kings/routed-proofs";
    else if (typeof body.folder === "string" && /^nile-kings\/products\/e2e-[\w-]+$/.test(body.folder)) folderOverride = body.folder;
  } else if (contentTypeHeader.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return apiBadRequest("يجب إرسال file");
    const buf = await file.arrayBuffer();
    imageData = Buffer.from(buf).toString("base64");
    if (file.type) contentType = file.type;
    const f = formData.get("folder");
    if (f === "proofs" || f === "routed-proofs") folderOverride = "nile-kings/routed-proofs";
    else if (typeof f === "string" && /^nile-kings\/products\/e2e-[\w-]+$/.test(f)) folderOverride = f;
  } else {
    return apiBadRequest("Content-Type: application/json أو multipart/form-data");
  }

  const folder = folderOverride ?? "nile-kings/products";
  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = await import("node:crypto");
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new FormData();
  form.append("file", `data:${contentType};base64,${imageData}`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);

  let res: Response | null = null;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: form,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Network error";
    return apiInternal("فشل رفع الصورة", { detail: msg });
  }

  const bodyText = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = bodyText || "Unknown error";
    try {
      const errJson = JSON.parse(bodyText) as { error?: { message?: string } };
      if (errJson?.error?.message) detail = errJson.error.message;
    } catch {
      if (bodyText.length > 200) detail = bodyText.slice(0, 200) + "…";
    }
    return apiInternal("فشل رفع الصورة", { detail });
  }

  let data: {
    secure_url?: string;
    public_id?: string;
    width?: number;
    height?: number;
    bytes?: number;
    format?: string;
  };
  try {
    data = JSON.parse(bodyText);
  } catch {
    return apiInternal("لم يُرجع Cloudinary رابطاً", { detail: "Invalid response" });
  }
  const url = data.secure_url;
  if (!url) return apiInternal("لم يُرجع Cloudinary رابطاً");

  let assetId: string | undefined;
  if (data.public_id) {
    const asset = await prisma.mediaAsset.upsert({
      where: { publicId: data.public_id },
      create: {
        publicId: data.public_id,
        url,
        width: data.width ?? null,
        height: data.height ?? null,
        bytes: data.bytes ?? null,
        format: data.format ?? null,
        folder,
        uploadedByUserId: actor.userId,
      },
      update: { url, deletedAt: null },
    });
    assetId = asset.id;
  }

  return apiSuccess({ url, publicId: data.public_id ?? undefined, assetId });
}
