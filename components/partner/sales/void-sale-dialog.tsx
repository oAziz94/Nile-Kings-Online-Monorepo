"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { VOID_REASON_MAX, VOID_REASON_MIN, VOID_TODAY_ONLY_MESSAGE } from "@/lib/sales/void-sale-shared";

/**
 * إلغاء الإيصال (backlog 11.4). The button is disabled with a visible hint once the receipt is from
 * before Cairo midnight (the API enforces it too). `url` is the outlet route by default; the admin
 * outlet detail (11.6) passes the admin route.
 */
export function VoidSaleControl({
  saleId,
  receiptNo,
  canVoid,
  url = `/api/partner/sales/${saleId}/void`,
  onVoided,
}: {
  saleId: string;
  receiptNo: number;
  canVoid: boolean;
  url?: string;
  /** Called after a successful void instead of `router.refresh()` (the admin drawer refetches itself). */
  onVoided?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);

  const trimmed = reason.trim();
  const valid = trimmed.length >= VOID_REASON_MIN && trimmed.length <= VOID_REASON_MAX;

  async function submit() {
    if (lock.current || !valid) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? "تعذّر إلغاء الإيصال");
        return;
      }
      setOpen(false);
      setReason("");
      toast({ title: `تم إلغاء الإيصال رقم ${receiptNo} وإرجاع المخزون` });
      if (onVoided) onVoided();
      else router.refresh();
    } catch {
      setError("تعذّر الاتصال، حاول مرة أخرى");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 max-w-xl">
      <Button
        type="button"
        variant="outline"
        disabled={!canVoid}
        aria-describedby={canVoid ? undefined : "void-hint"}
        onClick={() => setOpen(true)}
        className="border-destructive text-destructive hover:text-destructive"
        data-testid="void-open"
      >
        <Ban aria-hidden />
        إلغاء الإيصال
      </Button>
      {!canVoid && (
        <p id="void-hint" className="mt-2 text-sm text-ink-soft" data-testid="void-hint">
          {VOID_TODAY_ONLY_MESSAGE}. للإلغاء بعد ذلك تواصل مع الإدارة.
        </p>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        {/* Above the admin receipt drawer (Sheet, z-110): otherwise the dialog opens behind it. */}
        <DialogContent className="z-[130] max-w-md" overlayClassName="z-[129] bg-black/50">
          <DialogHeader>
            <DialogTitle>إلغاء الإيصال رقم {receiptNo}</DialogTitle>
            <DialogDescription>
              سيعود المخزون إلى المنفذ ويبقى الإيصال ظاهراً بحالة ملغي. لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="void-reason">سبب الإلغاء</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={VOID_REASON_MAX}
              rows={3}
              placeholder="مثال: أخطأت في الصنف"
              aria-invalid={error ? true : undefined}
              data-testid="void-reason"
            />
            <div className="mt-1 text-xs text-ink-soft">
              {VOID_REASON_MIN} أحرف على الأقل ({trimmed.length}/{VOID_REASON_MAX})
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive" data-testid="void-error">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              رجوع
            </Button>
            <Button type="button" variant="destructive" onClick={() => void submit()} disabled={!valid || busy} data-testid="void-confirm">
              {busy ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
