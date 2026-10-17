/**
 * Backlog 11.6 (d): an outlet (DISTRIBUTOR) is not linked to an agent. Shared by
 * `POST /api/admin/partners`, `PATCH /api/admin/partners/[id]` and the partner-request convert route.
 */
export const OUTLET_NO_AGENT_MESSAGE = "المنفذ لا يرتبط بوكيل";

/** Returns the 400 message when an outlet is given a (non-empty) linked agent, otherwise null. */
export function outletLinkedAgentError(
  partnerType: string | null | undefined,
  linkedAgentId: string | null | undefined
): string | null {
  if (partnerType !== "DISTRIBUTOR") return null;
  return typeof linkedAgentId === "string" && linkedAgentId.trim() ? OUTLET_NO_AGENT_MESSAGE : null;
}
