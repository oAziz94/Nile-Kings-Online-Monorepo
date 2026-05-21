-- Backfill city on legacy SavedAddress rows (city was nullable before checkout required it).

UPDATE "SavedAddress"
SET "city" = "governorate"
WHERE ("city" IS NULL OR TRIM("city") = '')
  AND "governorate" IN (
    'القاهرة',
    'الجيزة',
    'الإسكندرية',
    'بورسعيد',
    'السويس'
  );

UPDATE "SavedAddress"
SET "city" = TRIM("area")
WHERE ("city" IS NULL OR TRIM("city") = '')
  AND "area" IS NOT NULL
  AND TRIM("area") <> '';
