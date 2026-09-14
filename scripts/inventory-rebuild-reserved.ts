// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this script
// rewrote Variant.stockReserved from open InstaPay holds; that column no longer exists —
// reservation now lives only in PartnerInventory.stockReserved per partner. Kept as a stub (not
// deleted — the sandbox's destructive-action guard blocks file removal for this agent) so the
// npm script name still resolves; it does nothing.
console.log(
  "[retired] inventory-rebuild-reserved: Variant.stockReserved was dropped in backlog 9.9. Nothing to rebuild on the Variant row any more."
);
