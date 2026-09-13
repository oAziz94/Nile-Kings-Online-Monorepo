import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

const itemInclude = {
  select: {
    id: true,
    productName: true,
    variantName: true,
    quantity: true,
    unitPricePiastres: true,
    totalPiastres: true,
    variantId: true,
    variant: {
      select: {
        imageUrl: true,
        product: { select: { imageUrl: true } },
      },
    },
  },
} satisfies Prisma.OrderItemFindManyArgs;

// Additive (backlog 6.5a): the order's ticket status, for the footer's "سؤالك · <status>"
// button — null when the customer has never opened a ticket for this order.
const ticketInclude = {
  select: { status: true },
} satisfies Prisma.OrderTicketDefaultArgs;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: typeof itemInclude; ticket: typeof ticketInclude };
}>;

function mapOrder(o: OrderWithItems) {
  return {
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
    // Additive (backlog 6.4): the order's own stored address/phone, for the expanded detail's
    // "عنوان التوصيل" — no new endpoint, per the account-canvas decision to build detail only
    // from fields this list already fetches.
    shippingAddress: o.shippingAddress,
    cancellationReason: o.cancellationReason,
    ticketStatus: o.ticket?.status ?? null,
    items: o.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPricePiastres: item.unitPricePiastres,
      totalPiastres: item.totalPiastres,
      // Additive: the variant's own image, falling back to the product's — sand placeholder
      // client-side when both are null.
      imageUrl: item.variant.imageUrl ?? item.variant.product.imageUrl ?? null,
    })),
  };
}

/**
 * GET /api/profile/orders — list current user's orders with status.
 * Additive pagination (backlog 6.4): `?take=<n>` (optionally with `?cursor=<orderId>`) returns
 * `{ orders, nextCursor }`; with neither param the response is the bare array exactly as before
 * (parity — `docs/redesign/00-feature-inventory/public/profile-orders.md`).
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const takeParam = searchParams.get("take");
  const take = takeParam ? Number.parseInt(takeParam, 10) : undefined;
  const paginated = typeof take === "number" && Number.isFinite(take) && take > 0;

  const orders = await prisma.order.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    include: { items: itemInclude, ticket: ticketInclude },
    ...(paginated
      ? {
          take: take + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }
      : {}),
  });

  if (paginated) {
    const hasMore = orders.length > take;
    const pageRows = hasMore ? orders.slice(0, take) : orders;
    const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;
    return apiSuccess({ orders: pageRows.map(mapOrder), nextCursor });
  }

  return apiSuccess(orders.map(mapOrder));
}
