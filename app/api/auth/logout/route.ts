import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/auth/session";
import { apiSuccess } from "@/lib/api/response";

export async function POST() {
  const opts = sessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.delete(opts.name);
  return apiSuccess({}, "تم تسجيل الخروج", 200);
}
