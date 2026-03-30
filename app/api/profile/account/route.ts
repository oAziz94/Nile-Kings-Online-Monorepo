import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { getSeniorStatus } from "@/lib/senior/verify";

const MIN_PASSWORD_LEN = 8;

type AccountResponse = {
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  nationalIdLast4: string | null;
};

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** GET /api/profile/account — load current user's account info */
export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { phone: true, name: true, email: true },
  });

  const senior = await getSeniorStatus(user.userId);

  const response: AccountResponse = {
    phone: dbUser?.phone ?? user.phone,
    name: dbUser?.name ?? null,
    email: dbUser?.email ?? null,
    seniorVerified: senior.seniorVerified,
    nationalIdLast4: senior.nationalIdLast4,
  };

  return apiSuccess(response);
}

/** PATCH /api/profile/account — update name/email + change password */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  let body: {
    name?: string | null;
    email?: string | null;
    currentPassword?: string;
    newPassword?: string;
    newPasswordConfirm?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const emailProvided = "email" in body;
  const email = trimOrNull(body.email);

  if (name !== undefined && name.length < 2) {
    return apiBadRequest("الاسم مطلوب (حرفان على الأقل)");
  }

  const wantsPasswordChange =
    typeof body.currentPassword === "string" ||
    typeof body.newPassword === "string" ||
    typeof body.newPasswordConfirm === "string";

  let nextPasswordHash: string | undefined;

  if (wantsPasswordChange) {
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const newPasswordConfirm = typeof body.newPasswordConfirm === "string" ? body.newPasswordConfirm : "";

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      return apiBadRequest("كلمة المرور الحالية وكلمة المرور الجديدة وتأكيدها مطلوبة");
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      return apiBadRequest(`كلمة المرور الجديدة مطلوبة (${MIN_PASSWORD_LEN} أحرف على الأقل)`);
    }
    if (newPassword !== newPasswordConfirm) {
      return apiBadRequest("تأكيد كلمة المرور الجديدة غير مطابق");
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { passwordHash: true },
    });

    if (!dbUser?.passwordHash) {
      return apiBadRequest("لا يوجد كلمة مرور لهذا الحساب. استخدم صفحة استعادة كلمة المرور.");
    }

    const ok = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!ok) {
      return apiUnauthorized("كلمة المرور الحالية غير صحيحة");
    }

    nextPasswordHash = await hashPassword(newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: user.userId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(emailProvided ? { email } : {}),
      ...(nextPasswordHash ? { passwordHash: nextPasswordHash } : {}),
    },
    select: { phone: true, name: true, email: true },
  });

  const senior = await getSeniorStatus(user.userId);

  const response: AccountResponse = {
    phone: updated.phone,
    name: updated.name ?? null,
    email: updated.email ?? null,
    seniorVerified: senior.seniorVerified,
    nationalIdLast4: senior.nationalIdLast4,
  };

  return apiSuccess(response, "تم تحديث الحساب بنجاح");
}

