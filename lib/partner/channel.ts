/**
 * Sales-channel split (backlog 11.1, plan `12-distributor-store-plan.md` §1). `AGENT` is the
 * online channel; `DISTRIBUTOR` is a physical outlet (منفذ) that sells only in its own shop.
 * Outlets are never routed an online order and their stock never counts in any online/admin
 * total. Every aggregate over partners or `PartnerInventory` that feeds such a total uses
 * these helpers; per-partner reads a partner makes about its own stock do not.
 */
export const ONLINE_PARTNER_WHERE = { partnerType: "AGENT" } as const;

/** For `PartnerInventory` queries: restrict rows to online partners. */
export const ONLINE_INVENTORY_WHERE = { partner: ONLINE_PARTNER_WHERE } as const;

export function isOnlinePartner(partner: { partnerType: string }): boolean {
  return partner.partnerType === "AGENT";
}
