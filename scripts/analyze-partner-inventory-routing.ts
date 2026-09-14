// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this one-off
// analysis script (part of the completed Gamal partner-inventory routing/reconcile effort,
// migrations 20260713090000/20260806090000) queried raw SQL against Variant."stockAvailable"/
// "stockReserved", which no longer exist — stock lives only in PartnerInventory now. Kept as a
// stub (not deleted — the sandbox's destructive-action guard blocks file removal for this
// agent); it does nothing.
console.log(
  "[retired] analyze-partner-inventory-routing: Variant.stockAvailable/stockReserved were dropped in backlog 9.9."
);
