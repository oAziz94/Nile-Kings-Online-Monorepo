"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateEn } from "@/lib/format-en-numbers";
import { RestockStatusPill } from "./status-pill";
import { RestockItemLines } from "./item-lines";
import type { RestockRequest } from "./types";

const ACTIONABLE = new Set(["PENDING", "APPROVED"]);

/**
 * Agent-facing request card (backlog 4.20's "shared view model" — the "card" piece).
 * Preserves `distributor-requests.md`'s exact actionable-window rule: قبول/رفض only at
 * PENDING, تنفيذ التحويل at PENDING or APPROVED (approve is not a required gate before
 * fulfill), and the terminal-state read-only response-notes rendering. Adds the agent-only
 * inline distributor-stock line per item (backlog 4.20 (b)) via `RestockItemLines`.
 */
export function RestockRequestCard({
  request,
  responseDraft,
  onDraftChange,
  onApprove,
  onReject,
  onFulfillClick,
  updating,
}: {
  request: RestockRequest;
  responseDraft: string;
  onDraftChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onFulfillClick: () => void;
  updating: boolean;
}) {
  const actionable = ACTIONABLE.has(request.status);

  return (
    <div
      data-testid="restock-request-card"
      data-request-id={request.id}
      className="rounded-[14px] border border-stone-200 bg-white p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <RestockStatusPill status={request.status} />
            <span dir="ltr" className="text-xs text-ink-soft">
              {formatDateEn(request.createdAt)}
            </span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            من: {request.destinationPartner.name} ·{" "}
            <span dir="ltr">{request.destinationPartner.phone}</span>
          </p>
        </div>
        {actionable && (
          <div className="flex flex-wrap gap-2">
            {request.status === "PENDING" && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={updating}
                  onClick={onApprove}
                >
                  قبول
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={updating}
                  onClick={onReject}
                >
                  رفض
                </Button>
              </>
            )}
            <Button
              type="button"
              size="sm"
              className="rounded-lg"
              disabled={updating}
              onClick={onFulfillClick}
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تنفيذ التحويل
            </Button>
          </div>
        )}
      </div>

      <RestockItemLines items={request.items} showDestinationStock className="mt-3" />

      {request.notes && <p className="mt-3 text-xs text-ink-soft">ملاحظات: {request.notes}</p>}

      {actionable ? (
        <div className="mt-3 grid gap-2">
          <label htmlFor={`response-${request.id}`} className="text-xs font-bold text-ink-soft">
            رد الوكيل
          </label>
          <Textarea
            id={`response-${request.id}`}
            className="min-h-[72px]"
            value={responseDraft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="اكتب ملاحظة للموزع قبل قبول أو رفض أو تنفيذ الطلب"
          />
        </div>
      ) : request.responseNotes ? (
        <p className="mt-2 text-xs text-ink-soft">رد: {request.responseNotes}</p>
      ) : null}
    </div>
  );
}
