/**
 * Session: JWT in httpOnly cookie.
 * getCurrentUser() and requireAdmin() for API/server usage.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

type DbUserRow = { id: string; role: UserRole; phone: string };

const COOKIE_NAME = "nile_session";
const JWT_ISSUER = "nile-kings";
const JWT_AUDIENCE = "nile-kings-app";
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

export type SessionUser = {
  userId: string;
  phone: string;
  role: "CUSTOMER" | "ADMIN" | "PARTNER";
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

/**
 * Current user: JWT proves identity (`sub` = user id); phone and role come from DB
 * so a stale cookie (e.g. CUSTOMER in JWT after promotion to ADMIN) does not block access.
 */
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
    if (typeof sub !== "string" || sub.length === 0) {
      return null;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sub },
      select: { phone: true, role: true },
    });
    if (!dbUser) {
      return null;
    }

    return {
      userId: sub,
      phone: dbUser.phone,
      role: dbUser.role as "CUSTOMER" | "ADMIN" | "PARTNER",
    };
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

/** Admin access when User.role is ADMIN. Pass `cached` from getCurrentUser() to skip an extra User read. */
async function resolveAdminUser(userId: string, cached?: DbUserRow | null): Promise<{ phone: string } | null> {
  const dbUser: DbUserRow | null =
    cached && cached.id === userId
      ? cached
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, phone: true },
        });
  if (!dbUser || dbUser.role !== "ADMIN") return null;
  return { phone: dbUser.phone };
}

/** For server layouts: true if this user may use the admin area. */
export async function userHasAdminAccess(session: SessionUser): Promise<boolean> {
  const r = await resolveAdminUser(session.userId, {
    id: session.userId,
    role: session.role as UserRole,
    phone: session.phone,
  });
  return r !== null;
}

/** Require admin: User.role must be ADMIN (see resolveAdminUser). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }
  const resolved = await resolveAdminUser(user.userId, {
    id: user.userId,
    role: user.role as UserRole,
    phone: user.phone,
  });
  if (!resolved) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return {
    userId: user.userId,
    phone: resolved.phone,
    role: "ADMIN",
  };
}

export async function requirePartner(): Promise<SessionUser & { partnerId: string }> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const partner = await prisma.partner.findFirst({
    where: {
      OR: [{ userId: user.userId }, { phone: user.phone }],
      isActive: true,
    },
    select: { id: true },
  });
  if (!partner) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  return { ...user, role: "PARTNER", partnerId: partner.id };
}
