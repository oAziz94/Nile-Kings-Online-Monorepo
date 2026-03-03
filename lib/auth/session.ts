/**
 * Session: JWT in httpOnly cookie.
 * getCurrentUser() and requireAdmin() for API/server usage.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "nile_session";
const JWT_ISSUER = "nile-kings";
const JWT_AUDIENCE = "nile-kings-app";
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

export type SessionUser = {
  userId: string;
  phone: string;
  role: "CUSTOMER" | "ADMIN";
};

async function getSecret(): Promise<Uint8Array> {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function createSession(user: SessionUser): Promise<string> {
  const secret = await getSecret();
  const token = await new SignJWT({
    sub: user.userId,
    phone: user.phone,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE_SEC)
    .sign(secret);
  return token;
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SEC,
    path: "/",
  };
}

/** Get current user from JWT in cookie. Returns null if missing/invalid. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const sub = payload.sub;
    const phone = payload.phone;
    const role = payload.role;
    if (typeof sub !== "string" || typeof phone !== "string" || (role !== "CUSTOMER" && role !== "ADMIN")) {
      return null;
    }
    return { userId: sub, phone, role };
  } catch {
    return null;
  }
}

/** Require customer: must be logged in (any role). Returns user or throws with status 401. */
export async function requireCustomer(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  return user;
}

/** Require admin: must be logged in and role ADMIN (phone in AdminPhone). Returns user or throws. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  if (user.role !== "ADMIN") {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  // Optional: re-check AdminPhone in DB for revocation
  const admin = await prisma.adminPhone.findUnique({
    where: { phone: user.phone },
  });
  if (!admin) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return user;
}
