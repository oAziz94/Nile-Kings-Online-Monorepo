import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { getPhase1ShippingFee, PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import { getCodFeePercent } from "@/lib/settings";
import { computeCodFeePiastres } from "@/lib/checkout/cod-fee";
import { computePricing } from "@/lib/services/pricing";
import { isSeniorPromoEnabled } from "@/lib/settings";
import {
  releaseReservation,
  restoreCommittedStock,
  commitReservation,
  reconcileStockForAdminOrderItemEdit,
  stockLinesEquivalent,
  orderUsesReservationOnly,
  InsufficientStockError,
  type StockLine,
} from "@/lib/services/stock";
import {
  commitPartnerReservation,
  InsufficientPartnerStockError,
  reconcilePartnerStockForAdminOrderItemEdit,
  releasePartnerReservation,
  restorePartnerCommittedStock,
} from "@/lib/inventory/partner-inventory";
import { logOrderCancelled, logOrderConfirmed, logOrderStatusChange } from "@/lib/audit/order-audit";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

const orderDetailInclude = {
  user: { select: { id: true, phone: true, name: true } },
  items: {
    include: {
      variant: {
        select: {
          imageUrl: true,
          product: { select: { imageUrl: true } },
        },
      },
    },
  },
} as const;

type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

function mapOrderDetailApiRow(order: OrderDetailRow) {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: item.variant.imageUrl ?? item.variant.product.imageUrl ?? null,
      variant: undefined,
    })),
  };
}

type Params = Promise<{ id: string }>;
const INT32_MAX = 2_147_483_647;

type IncomingItem = { variantId: string; quantity: number };

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderDetailInclude,
  });
  if (!order) return apiNotFound("الطلب غير موجود");
  return apiSuccess(mapOrderDetailApiRow(order));
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { select: { weightGrams: true } },
            },
          },
        },
      },
    },
  });
  if (!existing) return apiNotFound("الطلب غير موجود");
  const existingOrder = existing;

  let body: {
    status?: string;
    userId?: string;
    savedAddressId?: string;
    items?: IncomingItem[];
    cancellationReason?: string | null;
    adminNotes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const nextStatus = typeof body.status === "string" ? body.status : undefined;
  const nextUserId = typeof body.userId === "string" ? body.userId.trim() : undefined;
  const nextSavedAddressId =
    typeof body.savedAddressId === "string" ? body.savedAddressId.trim() : undefined;
  const nextItems =
    Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : undefined;

  if (
    !nextStatus &&
    !nextUserId &&
    !nextSavedAddressId &&
    !nextItems &&
    body.adminNotes === undefined
  ) {
    return apiBadRequest("لا توجد حقول للتحديث");
  }
  if (nextStatus && !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
    return apiBadRequest("status غير صالح: " + ORDER_STATUSES.join(", "));
  }
  if (nextSavedAddressId && !nextUserId) {
    return apiBadRequest("يجب إرسال userId مع savedAddressId");
  }
  if (Array.isArray(body.items) && body.items.length === 0) {
    return apiBadRequest("يجب أن يحتوي الطلب على بند واحد على الأقل");
  }

  const transitioningToCancelled =
    nextStatus === "CANCELLED" && existing.status !== "CANCELLED";
  const leavingCreated =
    existing.status === "CREATED" &&
    !!nextStatus &&
    nextStatus !== "CREATED" &&
    nextStatus !== "CANCELLED";
  if (transitioningToCancelled && nextItems) {
    return apiBadRequest("لا يمكن تعديل أصناف الطلب مع إلغائه في نفس الطلب");
  }

  const oldItemStockLines: StockLine[] = existing.items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
  }));
  let newItemStockLines: StockLine[] | undefined;

  const data: Prisma.OrderUpdateInput = {};
  let nextItemsWeightGrams: number | undefined;
  let nextItemsAfterDiscounts: number | undefined;
  if (body.adminNotes !== undefined) {
    data.adminNotes = body.adminNotes === "" ? null : String(body.adminNotes).trim();
  }
  if (nextStatus) data.status = nextStatus as (typeof ORDER_STATUSES)[number];

  if (nextItems) {
    const normalized = new Map<string, number>();
    for (const raw of nextItems) {
      const variantId = typeof raw?.variantId === "string" ? raw.variantId.trim() : "";
      const quantity = typeof raw?.quantity === "number" ? Math.trunc(raw.quantity) : NaN;
      if (!variantId || !Number.isFinite(quantity) || quantity < 1) {
        return apiBadRequest("الكمية أو المتغير غير صالح");
      }
      normalized.set(variantId, (normalized.get(variantId) ?? 0) + quantity);
    }
    const lines = Array.from(normalized.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
    const variantIds = lines.map((l) => l.variantId);
    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true, slug: true, weightGrams: true } } },
    });
    if (variants.length !== variantIds.length) {
      return apiBadRequest("بعض المتغيرات غير موجودة");
    }
    const byId = new Map(variants.map((v) => [v.id, v]));

    let weightGrams = 0;
    const pricedLines: { variantId: string; quantity: number; unitPricePiastres: number }[] = [];
    for (const line of lines) {
      const variant = byId.get(line.variantId);
      if (!variant) return apiBadRequest("بعض المتغيرات غير موجودة");
      const w = variant.product.weightGrams;
      if (w == null || w < 0) {
        return apiBadRequest("لا يمكن إعادة حساب الشحن: وزن بعض المنتجات غير متوفر");
      }
      weightGrams += line.quantity * w;
      pricedLines.push({
        variantId: line.variantId,
        quantity: line.quantity,
        unitPricePiastres: variant.pricePiastres,
      });
    }

    const userIdForPricing = nextUserId ?? existing.userId;
    const user = await prisma.user.findUnique({
      where: { id: userIdForPricing },
      select: { seniorVerified: true },
    });
    const seniorPromoEnabled = await isSeniorPromoEnabled();
    const pricing = await computePricing({
      lines: pricedLines,
      couponCode: existing.couponCode ?? null,
      seniorVerified: user?.seniorVerified ?? false,
      seniorPromoEnabled,
    });
    const shippingAddress = (data.shippingAddress as Prisma.InputJsonValue | undefined) ?? existing.shippingAddress;
    const address = shippingAddress as { governorate?: string; city?: string | null; area?: string | null };
    if (!address?.governorate) {
      return apiBadRequest("لا يمكن حساب الشحن: عنوان الشحن غير صالح");
    }
    const shippingOption = getPhase1ShippingFee(
      { governorate: address.governorate, city: address.city ?? null, area: address.area ?? null },
      weightGrams
    );
    if (!shippingOption) {
      return apiBadRequest("لا يمكن حساب الشحن لهذا العنوان");
    }

    const beforeCod = pricing.totalPiastres + shippingOption.feePiastres;
    const codFeePercent = await getCodFeePercent();
    const codFee =
      existing.paymentMethod === "COD"
        ? computeCodFeePiastres(beforeCod, codFeePercent)
        : 0;
    const finalTotal = beforeCod + codFee;
    if ([pricing.subtotalPiastres, pricing.couponDiscountPiastres, pricing.seniorDiscountPiastres, shippingOption.feePiastres, shippingOption.carrierFeePiastres, codFee, finalTotal].some((n) => n < 0 || n > INT32_MAX)) {
      return apiBadRequest("قيمة الطلب تتجاوز الحد المسموح");
    }

    data.subtotalPiastres = pricing.subtotalPiastres;
    data.discountPiastres = pricing.couponDiscountPiastres;
    data.seniorFreeValuePiastres = pricing.seniorDiscountPiastres;
    data.shippingProvider = PHASE1_SHIPPING_PROVIDER_DISPLAY;
    data.shippingPiastres = shippingOption.feePiastres;
    data.carrierShippingPiastres = shippingOption.carrierFeePiastres;
    data.codFeePiastres = codFee;
    data.totalPiastres = finalTotal;
    data.couponCode = pricing.appliedCouponCode ?? null;
    nextItemsWeightGrams = weightGrams;
    nextItemsAfterDiscounts = pricing.totalPiastres;
    data.items = {
      deleteMany: {},
      create: lines.map((line) => {
        const variant = byId.get(line.variantId)!;
        const color = variant.colorName?.trim();
        const variantName = color ? `${variant.product.slug}-${variant.name}-${color}` : `${variant.product.slug}-${variant.name}`;
        return {
          variantId: line.variantId,
          productName: variant.product.name,
          variantName,
          sku: variant.sku,
          quantity: line.quantity,
          unitPricePiastres: variant.pricePiastres,
          totalPiastres: line.quantity * variant.pricePiastres,
        };
      }),
    };
    newItemStockLines = lines;
  }

  if (nextUserId) {
    const user = await prisma.user.findFirst({
      where: { id: nextUserId, role: "CUSTOMER" },
      select: { id: true },
    });
    if (!user) return apiBadRequest("العميل غير موجود");

    if (nextSavedAddressId) {
      const savedAddress = await prisma.savedAddress.findFirst({
        where: { id: nextSavedAddressId, userId: nextUserId },
      });
      if (!savedAddress) return apiBadRequest("العنوان غير موجود لهذا العميل");

      data.shippingAddress = {
        governorate: savedAddress.governorate,
        city: savedAddress.city,
        area: savedAddress.area,
        street: savedAddress.street,
        building: savedAddress.building,
        floor: savedAddress.floor,
        apartment: savedAddress.apartment,
        notes: savedAddress.notes,
        phone: savedAddress.phone,
        label: savedAddress.label,
        savedAddressId: savedAddress.id,
      };

      let weightGrams = 0;
      if (typeof nextItemsWeightGrams === "number") {
        weightGrams = nextItemsWeightGrams;
      } else {
        for (const item of existing.items) {
          const w = item.variant.product.weightGrams;
          if (w == null || w < 0) {
            return apiBadRequest("لا يمكن إعادة حساب الشحن: وزن بعض المنتجات غير متوفر");
          }
          weightGrams += item.quantity * w;
        }
      }

      const shippingOption = getPhase1ShippingFee(
        {
          governorate: savedAddress.governorate,
          city: savedAddress.city,
          area: savedAddress.area,
        },
        weightGrams
      );
      if (!shippingOption) {
        return apiBadRequest("لا يمكن حساب الشحن لهذا العنوان");
      }

      const itemsAfterDiscounts =
        typeof nextItemsAfterDiscounts === "number"
          ? nextItemsAfterDiscounts
          : Math.max(0, existing.subtotalPiastres - existing.discountPiastres - existing.seniorFreeValuePiastres);
      const beforeCod = itemsAfterDiscounts + shippingOption.feePiastres;
      const codFeePercent = await getCodFeePercent();
      const codFee =
        existing.paymentMethod === "COD"
          ? computeCodFeePiastres(beforeCod, codFeePercent)
          : 0;

      data.shippingProvider = PHASE1_SHIPPING_PROVIDER_DISPLAY;
      data.shippingPiastres = shippingOption.feePiastres;
      data.carrierShippingPiastres = shippingOption.carrierFeePiastres;
      data.codFeePiastres = codFee;
      data.totalPiastres = beforeCod + codFee;
    }

    data.user = { connect: { id: nextUserId } };
  }

  if (transitioningToCancelled) {
    data.cancellationReason =
      typeof body.cancellationReason === "string" && body.cancellationReason.trim()
        ? body.cancellationReason.trim()
        : "admin";
  }

  const itemEditChangesStock =
    Boolean(newItemStockLines) &&
    !stockLinesEquivalent(oldItemStockLines, newItemStockLines!);

  if (itemEditChangesStock && existing.status === "CANCELLED") {
    return apiBadRequest("لا يمكن تعديل أصناف طلب ملغى");
  }

  type OrderTx = Omit<
    typeof prisma,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
  >;

  async function applyInstaPayCapture(tx: OrderTx, orderId: string) {
    await tx.paymentAttempt.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "CAPTURED" },
    });
  }

  const isInstaPayPrepaid = existing.paymentMethod === "INSTAPAY_PREPAID";

  async function applyLeavingCreatedStock(tx: OrderTx, lines: StockLine[]) {
    if (existingOrder.assignedPartnerId) {
      await commitPartnerReservation(tx, existingOrder.assignedPartnerId, lines, id);
    } else {
      await commitReservation(tx, lines);
    }
    data.reservationExpiresAt = null;
    if (nextStatus === "CONFIRMED") {
      await logOrderConfirmed(tx, id);
    } else if (nextStatus) {
      await logOrderStatusChange(tx, id, "CREATED", nextStatus);
    }
    if (isInstaPayPrepaid) {
      await applyInstaPayCapture(tx, id);
    }
  }

  if (transitioningToCancelled) {
    const stockLines = existing.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));
    const cancellationAuditReason =
      typeof data.cancellationReason === "string" ? data.cancellationReason : "admin";
    const order = await prisma.$transaction(
      async (tx) => {
        if (existing.assignedPartnerId && orderUsesReservationOnly(existing.status)) {
          await releasePartnerReservation(tx, existing.assignedPartnerId, stockLines, existing.id);
        } else if (existing.assignedPartnerId) {
          await restorePartnerCommittedStock(tx, existing.assignedPartnerId, stockLines, existing.id);
        } else if (orderUsesReservationOnly(existing.status)) {
          await releaseReservation(tx, stockLines);
        } else {
          await restoreCommittedStock(tx, stockLines);
        }
        await logOrderCancelled(tx, existing.id, cancellationAuditReason, existing.status);
        return tx.order.update({
          where: { id },
          data,
          include: orderDetailInclude,
        });
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return apiSuccess(mapOrderDetailApiRow(order));
  }

  if (itemEditChangesStock) {
    try {
      const linesAfterEdit = newItemStockLines!;
      const order = await prisma.$transaction(
        async (tx) => {
          if (existing.assignedPartnerId) {
            await reconcilePartnerStockForAdminOrderItemEdit(
              tx,
              existing.assignedPartnerId,
              existing.status,
              oldItemStockLines,
              linesAfterEdit,
              existing.id
            );
          } else {
            await reconcileStockForAdminOrderItemEdit(
              tx,
              existing.status,
              oldItemStockLines,
              linesAfterEdit
            );
          }
          if (leavingCreated) {
            await applyLeavingCreatedStock(tx, linesAfterEdit);
          }
          return tx.order.update({
            where: { id },
            data,
            include: orderDetailInclude,
          });
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
      return apiSuccess(mapOrderDetailApiRow(order));
    } catch (e) {
      if (e instanceof InsufficientStockError || e instanceof InsufficientPartnerStockError) {
        return apiBadRequest("كمية غير متوفرة في المخزون لتعديل الطلب بهذه الأصناف");
      }
      throw e;
    }
  }

  if (leavingCreated) {
    try {
      const order = await prisma.$transaction(
        async (tx) => {
          await applyLeavingCreatedStock(tx, oldItemStockLines);
          return tx.order.update({
            where: { id },
            data,
            include: orderDetailInclude,
          });
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
      return apiSuccess(mapOrderDetailApiRow(order));
    } catch (e) {
      if (e instanceof InsufficientStockError || e instanceof InsufficientPartnerStockError) {
        return apiBadRequest("كمية غير متوفرة في المخزون لتأكيد الطلب");
      }
      throw e;
    }
  }

  const order = await prisma.order.update({
    where: { id },
    data,
    include: orderDetailInclude,
  });
  return apiSuccess(mapOrderDetailApiRow(order));
}
