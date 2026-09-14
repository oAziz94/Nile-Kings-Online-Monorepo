// Retired by backlog 9.9 ("Retire the legacy variant stock columns", v2.3.x): this one-off
// export script read PartnerInventory for the Gamal partner — still a valid table, but it was
// part of the completed one-off Gamal reconcile effort and is superseded by the general
// partner stock/report tooling (`lib/analytics/partner-inventory-report.ts`,
// `/partner/stock`). Kept as a stub (not deleted — the sandbox's destructive-action guard
// blocks file removal for this agent); it does nothing.
console.log(
  "[retired] gamal-available-inventory: superseded by the partner stock report tooling (backlog 9.9 cleanup)."
);
