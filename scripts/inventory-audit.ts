// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this script
// compared Variant.stockAvailable/stockReserved against open InstaPay holds; those columns no
// longer exist — reservation now lives only in PartnerInventory.stockReserved per partner. Kept
// as a stub (not deleted — the sandbox's destructive-action guard blocks file removal for this
// agent) so the npm script name still resolves; it does nothing.
console.log(
  "[retired] inventory-audit: Variant.stockAvailable/stockReserved were dropped in backlog 9.9. Use PartnerInventory-based tooling instead."
);
