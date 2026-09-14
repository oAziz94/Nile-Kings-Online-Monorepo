// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this one-off
// analysis script read Variant."stockAvailable"/"stockReserved" via raw SQL against open
// InstaPay CREATED orders; the Variant columns no longer exist — reservation now lives only in
// PartnerInventory.stockReserved per partner. Kept as a stub (not deleted — the sandbox's
// destructive-action guard blocks file removal for this agent); it does nothing.
console.log(
  "[retired] analyze-reserved-stock: Variant.stockAvailable/stockReserved were dropped in backlog 9.9."
);
