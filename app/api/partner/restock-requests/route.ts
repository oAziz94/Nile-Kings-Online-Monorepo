import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { createRestockRequest } from "@/lib/inventory/restock-requests";

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    const where =
      partner?.partnerType === "AGENT"
        ? { sourcePartnerId: user.partnerId }
        : { destinationPartnerId: user.partnerId };
    const requests = await prisma.restockRequest.findMany({
      where,
      include: {
        sourcePartner: { select: { id: true, name: true, phone: true, partnerType: true } },
        destinationPartner: { select: { id: true, name: true, phone: true, partnerType: true } },
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                name: true,
                colorName: true,
                product: { select: { name: true, slug: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return apiSuccess({ requests });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requirePartner();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { partnerType: true },
  });
  if (partner?.partnerType !== "DISTRIBUTOR") {
    return apiForbidden("طلبات إعادة التوريد متاحة للموزعين فقط");
  }

  let body: {
    sourceAgentPartnerId?: string | null;
    notes?: string | null;
    items?: { variantId?: string; quantity?: number }[];
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const lines = (body.items ?? []).map((item) => ({
    variantId: item.variantId?.trim() ?? "",
    quantity: typeof item.quantity === "number" ? Math.trunc(item.quantity) : 0,
  }));
  if (lines.length === 0 || lines.some((line) => !line.variantId || line.quantity < 1)) {
    return apiBadRequest("يجب إرسال أصناف وكميات صحيحة");
  }

  try {
    const request = await createRestockRequest({
      distributorPartnerId: user.partnerId,
      sourceAgentPartnerId: body.sourceAgentPartnerId ?? null,
      lines,
      notes: body.notes?.trim() || null,
    });
    return apiSuccess(request, "تم إنشاء طلب إعادة التوريد", 201);
  } catch (error) {
    return apiBadRequest(error instanceof Error ? error.message : "تعذر إنشاء طلب إعادة التوريد");
  }
}
