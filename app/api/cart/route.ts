import { getCurrentCartPayload } from "@/lib/cart/cart";
import { apiSuccess, apiInternal } from "@/lib/api/response";

export async function GET() {
  try {
    const cart = await getCurrentCartPayload();
    if (!cart) {
      return apiInternal("لم يتم العثور على السلة");
    }
    return apiSuccess(cart);
  } catch (e) {
    console.error("GET /api/cart", e);
    return apiInternal("خطأ في جلب السلة");
  }
}
