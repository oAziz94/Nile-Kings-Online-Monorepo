-- AlterTable Product: weight (grams), base/discount price
ALTER TABLE "Product" ADD COLUMN "weightGrams" INTEGER;
ALTER TABLE "Product" ADD COLUMN "basePricePiastres" INTEGER;
ALTER TABLE "Product" ADD COLUMN "discountPricePiastres" INTEGER;

-- AlterTable Variant: optional color
ALTER TABLE "Variant" ADD COLUMN "colorHex" TEXT;
ALTER TABLE "Variant" ADD COLUMN "colorName" TEXT;
