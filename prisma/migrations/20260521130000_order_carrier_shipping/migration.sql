-- Carrier-only shipping for courier/partner (customer shipping unchanged on shippingPiastres)
ALTER TABLE "Order" ADD COLUMN "carrierShippingPiastres" INTEGER NOT NULL DEFAULT 0;
