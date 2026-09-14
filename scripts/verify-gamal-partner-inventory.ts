// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this script
// compared Variant.stockAvailable/stockReserved against a partner's PartnerInventory rows; the
// Variant columns no longer exist — PartnerInventory is the only source of truth now. Kept as a
// stub (not deleted — the sandbox's destructive-action guard blocks file removal for this agent)
// so the npm script name still resolves; it does nothing.
console.log(
  "[retired] verify-gamal-partner-inventory: Variant.stockAvailable/stockReserved were dropped in backlog 9.9. Nothing left to compare against."
);
