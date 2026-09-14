/**
 * Signed Cloudinary upload — shared by `POST /api/admin/upload` and `POST
 * /api/admin/media/[id]/replace` (backlog 9.8a) so the signing logic lives in one place (B3).
 */
import crypto from "node:crypto";

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
};

export function cloudinaryCredentialsAvailable(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

export async function uploadToCloudinary(params: {
  base64: string;
  contentType: string;
  folder: string;
}): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary غير مضبوط");

  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `folder=${params.folder}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new FormData();
  form.append("file", `data:${params.contentType};base64,${params.base64}`);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", params.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as CloudinaryUploadResult;
}
