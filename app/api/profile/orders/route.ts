import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

/** GET /api/profile/orders — list current user's orders with status */
export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const orders = await prisma.order.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        select: {
          id: true,
          productName: true,
          variantName: true,
          quantity: true,
          unitPricePiastres: true,
          totalPiastres: true,
        },
      },
    },
  });

  return apiSuccess(
    orders.map((o) => ({
      id: o.id,
      status: o.status,
      subtotalPiastres: o.subtotalPiastres,
      discountPiastres: o.discountPiastres,
      shippingPiastres: o.shippingPiastres,
      codFeePiastres: o.codFeePiastres,
      totalPiastres: o.totalPiastres,
      shippingProvider: o.shippingProvider,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt,
      reservationExpiresAt: o.reservationExpiresAt,
      items: o.items,
    }))
  );
}
