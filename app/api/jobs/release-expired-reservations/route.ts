import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { releaseReservation } from "@/lib/services/stock";
import { logOrderCancelled } from "@/lib/audit/order-audit";
import { apiSuccess, apiError } from "@/lib/api/response";

const CRON_SECRET_HEADER = "x-cron-secret";

function validateCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get(CRON_SECRET_HEADER);
  const querySecret = req.nextUrl.searchParams.get("secret");
  return !!secret && (headerSecret === secret || querySecret === secret);
}

async function runReleaseJob() {
  const now = new Date();
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "CREATED",
      reservationExpiresAt: { lt: now },
    },
    include: {
      items: { select: { variantId: true, quantity: true } },
    },
  });

  let released = 0;
  for (const order of expiredOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        const lines = order.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        }));
        await releaseReservation(tx, lines);
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            cancellationReason: "expired",
          },
        });
        await logOrderCancelled(tx, order.id, "expired");
      });
      released++;
    } catch (e) {
      console.error(`release-expired-reservations: failed order ${order.id}`, e);
    }
  }

  return apiSuccess({ released, total: expiredOrders.length });
}

/**
 * POST or GET (for Vercel cron) /api/jobs/release-expired-reservations
 * Protected by: header x-cron-secret = CRON_SECRET, or query param secret = CRON_SECRET.
 * Finds orders in CREATED where reservationExpiresAt < now, releases stockReserved, marks order CANCELLED (reason: expired).
 */
export async function POST(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return apiError("UNAUTHORIZED", "Invalid or missing cron secret");
  }
  return runReleaseJob();
}

/** GET supported for Vercel cron (use ?secret=CRON_SECRET). */
export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return apiError("UNAUTHORIZED", "Invalid or missing cron secret");
  }
  return runReleaseJob();
}
