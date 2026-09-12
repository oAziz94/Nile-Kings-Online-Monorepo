"use client";

import * as React from "react";
import { AlertTriangle, ClipboardList, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerRoleGatePanel } from "@/components/partner/role-gate-panel";
import { RestockItemLines } from "@/components/partner/restock/item-lines";
import { RestockRequestCard } from "@/components/partner/restock/request-card";
import type { RestockRequest } from "@/components/partner/restock/types";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ApiEnvelope<T> = { success?: boolean; data?: T; error?: { message?: string } };

async function fetchRequests(): Promise<RestockRequest[]> {
  const res = await fetch("/api/partner/restock-requests", { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<{ requests: RestockRequest[] }> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل طلبات الموزعين");
  }
  return json.data?.requests ?? [];
}

type Action = "approve" | "reject" | "fulfill";

async function patchRequest(id: string, action: Action, responseNotes: string | null) {
  const res = await fetch(`/api/partner/restock-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, responseNotes }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<unknown> | null;
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحديث الطلب");
  }
  return json.data;
}

function PageSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-[14px]" />
      ))}
    </div>
  );
}

export default function PartnerDistributorRequestsPage() {
  const { data: me, isLoading: meLoading, isError: meError, refetch: refetchMe } = usePartnerMe();

  if (meLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="طلبات الموزعين" description="مراجعة طلبات إعادة التوريد القادمة من الموزعين وتنفيذها من مخزونك." />
        <PageSkeleton />
      </div>
    );
  }

  if (meError || !me) {
    return (
      <div className="space-y-6">
        <PageHeader title="طلبات الموزعين" />
        <div role="alert" className="rounded-[14px] border border-danger-bg bg-danger-bg/60 p-4 text-sm text-danger-text">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4" />
            تعذر تحميل بيانات الحساب
          </p>
          <button
            type="button"
            onClick={() => refetchMe()}
            className="mt-2 text-xs font-bold underline underline-offset-2"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (me.partnerType !== "AGENT") {
    return (
      <div className="space-y-6">
        <PageHeader title="طلبات الموزعين" />
        <PartnerRoleGatePanel allowedRole="AGENT" />
      </div>
    );
  }

  return <DistributorRequestsContent />;
}

function DistributorRequestsContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responseDrafts, setResponseDrafts] = React.useState<Record<string, string>>({});
  const [fulfillTarget, setFulfillTarget] = React.useState<RestockRequest | null>(null);

  const {
    data: requests = [],
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["partner-restock-requests", "agent"],
    queryFn: fetchRequests,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) =>
      patchRequest(id, action, responseDrafts[id]?.trim() || null),
    onSuccess: () => {
      toast({ title: "تم تحديث طلب الموزع" });
      queryClient.invalidateQueries({ queryKey: ["partner-restock-requests", "agent"] });
    },
    onError: (error: unknown) => {
      toast({
        title: error instanceof Error ? error.message : "فشل تحديث الطلب",
        variant: "destructive",
      });
    },
  });

  React.useEffect(() => {
    if (isError) {
      toast({ title: "فشل تحميل طلبات الموزعين", variant: "destructive" });
    }
    // Only fire the toast once per failed fetch, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  function draftFor(request: RestockRequest) {
    return responseDrafts[request.id] ?? request.responseNotes ?? "";
  }

  const updatingId = mutation.isPending ? mutation.variables?.id ?? null : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="طلبات الموزعين"
        description="مراجعة طلبات إعادة التوريد القادمة من الموزعين وتنفيذها من مخزونك."
        actions={
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard title="طلبات إعادة التوريد" icon={<ClipboardList className="h-5 w-5 text-lapis-800" />}>
        {isLoading ? (
          <PageSkeleton />
        ) : isError ? (
          <div role="alert" className="rounded-[14px] border border-danger-bg bg-danger-bg/60 p-4 text-sm text-danger-text">
            <p className="flex items-center gap-2 font-bold">
              <AlertTriangle className="h-4 w-4" />
              فشل تحميل طلبات الموزعين
            </p>
            <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-bold underline underline-offset-2">
              إعادة المحاولة
            </button>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="لا توجد طلبات موزعين" />
        ) : (
          <div className={cn("space-y-3", isFetching && "opacity-70")}>
            {requests.map((request) => (
              <RestockRequestCard
                key={request.id}
                request={request}
                responseDraft={draftFor(request)}
                onDraftChange={(value) =>
                  setResponseDrafts((current) => ({ ...current, [request.id]: value }))
                }
                onApprove={() => mutation.mutate({ id: request.id, action: "approve" })}
                onReject={() => mutation.mutate({ id: request.id, action: "reject" })}
                onFulfillClick={() => setFulfillTarget(request)}
                updating={updatingId === request.id}
              />
            ))}
          </div>
        )}
      </PanelCard>

      {/* Backlog 4.20 (a): confirm dialog before "تنفيذ التحويل" listing the lines/quantities that will move. */}
      <Dialog open={fulfillTarget !== null} onOpenChange={(open) => !open && setFulfillTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد تنفيذ التحويل</DialogTitle>
            <DialogDescription>
              سيتم خصم الكميات التالية من مخزونك وإضافتها إلى مخزون{" "}
              {fulfillTarget?.destinationPartner.name}. هذا الإجراء فوري ولا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          {fulfillTarget && <RestockItemLines items={fulfillTarget.items} showDestinationStock dense />}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setFulfillTarget(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              className="rounded-lg"
              disabled={mutation.isPending}
              onClick={() => {
                if (!fulfillTarget) return;
                const id = fulfillTarget.id;
                setFulfillTarget(null);
                mutation.mutate({ id, action: "fulfill" });
              }}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تأكيد ونقل المخزون
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
