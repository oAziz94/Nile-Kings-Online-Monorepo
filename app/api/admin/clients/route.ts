import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { parseCreateAddressInput } from "@/lib/admin/address";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

const MIN_PASSWORD_LEN = 8;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const roleParam = (searchParams.get("role") ?? "CUSTOMER").toUpperCase();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const role: "CUSTOMER" | "ADMIN" =
    roleParam === "ADMIN" ? "ADMIN" : "CUSTOMER";

  const where: {
    role: "CUSTOMER" | "ADMIN";
    OR?: Array<{
      phone?: { contains: string; mode: "insensitive" };
      name?: { contains: string; mode: "insensitive" };
      email?: { contains: string; mode: "insensitive" };
    }>;
  } = { role };
  if (q) {
    where.OR = [
      { phone: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [clients, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        seniorVerified: true,
        createdAt: true,
        _count: { select: { orders: true, savedAddresses: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return apiSuccess({ clients, total, limit, offset });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: {
    phone?: string;
    name?: string;
    email?: string;
    password?: string;
    address?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const phone = body.phone?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim() || null;
  const password = body.password;

  if (!phone) return apiBadRequest("رقم الجوال مطلوب");
  if (!name || name.length < 2) return apiBadRequest("الاسم مطلوب (حرفان على الأقل)");
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return apiBadRequest(`كلمة المرور مطلوبة (${MIN_PASSWORD_LEN} أحرف على الأقل)`);
  }

  const addressParsed = parseCreateAddressInput(body.address);
  if (!addressParsed.ok) return apiBadRequest(addressParsed.message);

  const normalizedPhone = normalizeEgyptMobilePhone(phone);
  if (!normalizedPhone) {
    return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
  }

  const existing = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });
  if (existing) {
    return apiBadRequest("هذا الرقم مسجّل مسبقاً");
  }

  const passwordHash = await hashPassword(password);
  const { address } = addressParsed;

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        phone: normalizedPhone,
        passwordHash,
        name,
        email,
        role: "CUSTOMER",
      },
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (address.isDefault) {
      await tx.savedAddress.updateMany({
        where: { userId: created.id },
        data: { isDefault: false },
      });
    }

    await tx.savedAddress.create({
      data: {
        userId: created.id,
        label: address.label,
        governorate: address.governorate,
        city: address.city,
        area: address.area,
        street: address.street,
        building: address.building,
        floor: address.floor,
        apartment: address.apartment,
        notes: address.notes,
        phone: address.phone,
        isDefault: address.isDefault ?? true,
      },
    });

    return created;
  });

  return apiSuccess({ user }, "تم إنشاء العميل", 201);
}
