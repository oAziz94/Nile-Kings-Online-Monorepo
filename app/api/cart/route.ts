import { getOrCreateCart, getCartPayload } from "@/lib/cart/cart";
import { apiSuccess, apiInternal } from "@/lib/api/response";

export async function GET() {
  try {
    const { cartId } = await getOrCreateCart();
    const cart = await getCartPayload(cartId);
    if (!cart) {
      return apiInternal("لم يتم العثور على السلة");
    }
    return apiSuccess(cart);
  } catch (e) {
    console.error("GET /api/cart", e);
    return apiInternal("خطأ في جلب السلة");
  }
}
