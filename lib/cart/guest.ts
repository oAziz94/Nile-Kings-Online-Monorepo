/**
 * Guest cart: httpOnly cookie with UUID.
 * Cart is stored in DB keyed by guestToken (unique).
 */

import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export const GUEST_COOKIE_NAME = "nile_guest";
const GUEST_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

export function guestCookieOptions() {
  return {
    name: GUEST_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: GUEST_COOKIE_MAX_AGE,
    path: "/",
  };
}

/** Get existing guest token or create new one and set cookie. Returns the token. */
export async function getOrCreateGuestToken(): Promise<string> {
  const cookieStore = await cookies();
  let token = cookieStore.get(GUEST_COOKIE_NAME)?.value;

  if (!token || !isValidUuid(token)) {
    token = randomUUID();
    const opts = guestCookieOptions();
    cookieStore.set(opts.name, token, {
      httpOnly: opts.httpOnly,
      secure: opts.secure,
      sameSite: opts.sameSite,
      maxAge: opts.maxAge,
      path: opts.path,
    });
  }

  return token;
}

/** Read guest token without creating. Returns null if missing/invalid. */
export async function getGuestToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_COOKIE_NAME)?.value ?? null;
  return token && isValidUuid(token) ? token : null;
}

/** Clear guest cookie (after merge on login). */
export async function clearGuestCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE_NAME);
}

function isValidUuid(s: string): boolean {
  const u =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return u.test(s);
}
