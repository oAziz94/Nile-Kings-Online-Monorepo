import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Tags each request with its full path so server layouts (e.g. admin/partner
 * auth guards) can build a "redirect back here after login" URL without
 * hardcoding a destination. No auth logic here — that stays in the layouts.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*", "/partner/:path*"],
};
