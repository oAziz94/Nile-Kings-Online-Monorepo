// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this script
// backfilled PartnerInventory rows from Variant.stockAvailable/stockReserved, which no longer
// exist on the Variant model — stock lives only in PartnerInventory now. Kept as a stub (not
// deleted — the sandbox's destructive-action guard blocks file removal for this agent) so the
// npm script name still resolves; it does nothing.
console.log(
  "[retired] backfill-gamal-partner-inventory: Variant.stockAvailable/stockReserved were dropped in backlog 9.9. Nothing to backfill from any more."
);
