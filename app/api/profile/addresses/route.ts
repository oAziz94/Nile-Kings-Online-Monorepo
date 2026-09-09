import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { createSavedAddress } from "@/lib/addresses/create";

/** GET /api/profile/addresses — list saved addresses */
export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const list = await prisma.savedAddress.findMany({
    where: { userId: user.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return apiSuccess(list);
}

/** POST /api/profile/addresses — create saved address */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const result = await createSavedAddress(user.userId, {
    label: typeof body.label === "string" ? body.label : null,
    governorate: typeof body.governorate === "string" ? body.governorate : "",
    city: typeof body.city === "string" ? body.city : "",
    area: typeof body.area === "string" ? body.area : null,
    street: typeof body.street === "string" ? body.street : "",
    building: typeof body.building === "string" ? body.building : null,
    floor: typeof body.floor === "string" ? body.floor : null,
    apartment: typeof body.apartment === "string" ? body.apartment : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    phone: typeof body.phone === "string" ? body.phone : "",
    isDefault: body.isDefault === true,
  });
  if (!result.ok) return apiBadRequest(result.error);

  return apiSuccess(result.address, undefined, 201);
}
