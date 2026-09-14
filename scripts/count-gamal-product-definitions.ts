// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this one-off
// analysis script (part of the completed Gamal partner-inventory routing/reconcile effort)
// summed PartnerInventory alongside raw SQL that also touched Variant."stockAvailable"/
// "stockReserved", which no longer exist. Kept as a stub (not deleted — the sandbox's
// destructive-action guard blocks file removal for this agent); it does nothing.
console.log(
  "[retired] count-gamal-product-definitions: Variant.stockAvailable/stockReserved were dropped in backlog 9.9."
);
