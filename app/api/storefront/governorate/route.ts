import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  normalizeStorefrontGovernorate,
  STOREFRONT_GOVERNORATE_COOKIE,
} from "@/lib/storefront-location";

const MAX_AGE_SEC = 60 * 60 * 24 * 180;

export async function GET(req: NextRequest) {
  const governorate = normalizeStorefrontGovernorate(
    req.cookies.get(STOREFRONT_GOVERNORATE_COOKIE)?.value
  );
  return apiSuccess({ governorate, options: GOVERNORATE_OPTIONS });
}

export async function POST(req: NextRequest) {
  let body: { governorate?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const governorate = normalizeStorefrontGovernorate(body.governorate);
  if (!governorate) return apiBadRequest("اختر محافظة صحيحة");

  const response = apiSuccess({ governorate }, "تم حفظ المحافظة");
  response.cookies.set({
    name: STOREFRONT_GOVERNORATE_COOKIE,
    value: governorate,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}
