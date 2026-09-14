/**
 * Cloudinary Admin API calls used by the الصور library (backlog 9.8a (d)/(e)): listing a
 * folder for "مزامنة مع Cloudinary" and destroying an unused asset on delete. Never prints the
 * API key/secret — they only go into the Basic-Auth header / the signed-upload signature, both
 * of which this module builds itself. Throws when Cloudinary is not configured or the API call
 * fails; callers decide how to surface that (the routes turn it into a 501/500 apiError).
 */
import crypto from "node:crypto";

function credentials(): { cloudName: string; apiKey: string; apiSecret: string } {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary غير مضبوط");
  }
  return { cloudName, apiKey, apiSecret };
}

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  );
}

export type CloudinaryListResource = {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  folder?: string;
};

/** One page of `GET /resources/image` for `prefix`, following `next_cursor`. Admin API GET
 * calls are authenticated with plain HTTP Basic Auth (api_key:api_secret) — no signature. */
export async function listCloudinaryResourcesPage(
  prefix: string,
  cursor?: string,
  maxResults = 500
): Promise<{ resources: CloudinaryListResource[]; nextCursor: string | null }> {
  const { cloudName, apiKey, apiSecret } = credentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = new URL(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image`);
  url.searchParams.set("type", "upload");
  url.searchParams.set("prefix", prefix);
  url.searchParams.set("max_results", String(maxResults));
  if (cursor) url.searchParams.set("next_cursor", cursor);

  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudinary list failed: ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { resources?: CloudinaryListResource[]; next_cursor?: string };
  return { resources: json.resources ?? [], nextCursor: json.next_cursor ?? null };
}

/** Every resource under `prefix`, paginating `next_cursor` until exhausted. */
export async function listAllCloudinaryResources(prefix: string): Promise<CloudinaryListResource[]> {
  const all: CloudinaryListResource[] = [];
  let cursor: string | undefined;
  do {
    const page = await listCloudinaryResourcesPage(prefix, cursor);
    all.push(...page.resources);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return all;
}

/** Read-only single-resource lookup (`GET /resources/image/upload/<publicId>`) — used to
 * confirm a resource is actually gone before deleting its `MediaAsset` row (never delete a row
 * on the strength of a guess; list/look first). Returns `false` on a 404, `true` otherwise. */
export async function cloudinaryResourceExists(publicId: string): Promise<boolean> {
  const { cloudName, apiKey, apiSecret } = credentials();
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload/${encodeURIComponent(publicId)}`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Cloudinary lookup failed: ${res.status}`);
  return true;
}

/** Signed `destroy` — only ever called on an asset already confirmed unused by the caller. */
export async function destroyCloudinaryAsset(publicId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = credentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", apiKey);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cloudinary destroy failed: ${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { result?: string };
  if (json.result !== "ok" && json.result !== "not found") {
    throw new Error(`Cloudinary destroy result: ${json.result}`);
  }
}
