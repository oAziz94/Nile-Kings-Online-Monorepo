/**
 * Shared view model for the restock-request screens (backlog 4.20):
 * distributor-facing `/partner/restock-requests` and agent-facing
 * `/partner/distributor-requests`. Both consume the same
 * `GET /api/partner/restock-requests` shape — this file is the one place that shape
 * is typed, so the two pages cannot silently drift (per
 * `docs/redesign/00-feature-inventory/partner/restock-requests.md` Notes).
 */

export type RestockRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "FULFILLED"
  | "CANCELLED";

export type RestockRequestPartyInfo = {
  /** Already returned by `GET /api/partner/restock-requests` (both parties' `select` includes
   * `id`) — added here for backlog 5.5's network sheet, which filters this shared list by
   * `destinationPartner.id` per distributor. Additive; existing consumers ignored it. */
  id: string;
  name: string;
  phone: string;
};

/** Additive per backlog 4.20 (b) — present only when the caller is an AGENT. */
export type DestinationStock = {
  stockAvailable: number;
  stockReserved: number;
};

export type RestockRequestItem = {
  id: string;
  quantity: number;
  variant: {
    id: string;
    sku: string;
    name: string;
    colorName: string | null;
    product: { name: string };
  };
  /** Only populated for an AGENT caller (backlog 4.20 (b)); absent for DISTRIBUTOR callers. */
  destinationStock?: DestinationStock;
};

export type RestockRequest = {
  id: string;
  status: RestockRequestStatus;
  createdAt: string;
  notes: string | null;
  responseNotes: string | null;
  cancelledAt?: string | null;
  sourcePartner: RestockRequestPartyInfo;
  destinationPartner: RestockRequestPartyInfo;
  items: RestockRequestItem[];
};
