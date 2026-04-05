-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "bogoPayQuantity" INTEGER,
ADD COLUMN     "bogoFreeQuantity" INTEGER,
ADD COLUMN     "bogoSameVariantOnly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPromotionPopup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promotionPopupMessage" TEXT;
