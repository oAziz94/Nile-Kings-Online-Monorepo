"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

/**
 * Backlog 8.2 — admin partner edit + deactivate. `PATCH /api/admin/partners/[id]` already
 * supports `name`, `governorate`, `phone`, `linkedAgentId`, `isActive` (plus other fields
 * out of this task's scope). This turns the read-only rows shown in the two detail dialogs
 * (`AgentsTab`/`DistributorsTab` in `app/(admin)/admin/partners/page.tsx`) into a form when
 * "تعديل" is pressed; a separate "تعطيل الحساب"/"تفعيل الحساب" button + confirm dialog sends
 * `isActive` alone. No API change, no new chrome beyond what the task calls for.
 */

export type EditablePartner = {
  id: string;
  partnerType: string;
  name: string;
  governorate: string;
  phone: string;
  isActive: boolean;
  linkedAgentId?: string | null;
};

export type PartnerPatchResponse = {
  id: string;
  name: string;
  governorate: string;
  phone: string;
  isActive: boolean;
  linkedAgentId: string | null;
};

const partnerEditSchema = z.object({
  name: z.string().trim().min(1, "الاسم لا يمكن أن يكون فارغاً"),
  governorate: z.string().trim().min(1, "المحافظة مطلوبة"),
  phone: z
    .string()
    .trim()
    .min(1, "رقم التليفون مطلوب")
    .refine((v) => !!normalizeEgyptMobilePhone(v), EGYPT_MOBILE_ERROR_MESSAGE),
  linkedAgentId: z.string(),
});
type PartnerEditValues = z.infer<typeof partnerEditSchema>;

async function patchPartner(
  id: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; data?: PartnerPatchResponse; message?: string }> {
  const res = await fetch(`/api/admin/partners/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (json?.success) return { success: true, data: json.data as PartnerPatchResponse };
  return { success: false, message: json?.error?.message ?? "حدث خطأ، حاول مرة أخرى" };
}

export function PartnerEditForm({
  partner,
  agents,
  onUpdated,
}: {
  partner: EditablePartner;
  /** Only used when `partner.partnerType === "DISTRIBUTOR"`. */
  agents: { id: string; name: string }[];
  onUpdated: (updated: PartnerPatchResponse) => void;
}) {
  const [mode, setMode] = React.useState<"read" | "edit">("read");
  // Focus management (8.2 verifier): into the first field on edit, back to the trigger on cancel/save.
  const editButtonRef = React.useRef<HTMLButtonElement>(null);
  const wasEditing = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [confirmToggleOpen, setConfirmToggleOpen] = React.useState(false);
  const [togglingActive, setTogglingActive] = React.useState(false);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const form = useForm<PartnerEditValues>({
    resolver: zodResolver(partnerEditSchema),
    defaultValues: {
      name: partner.name,
      governorate: partner.governorate,
      phone: partner.phone,
      linkedAgentId: partner.linkedAgentId ?? "",
    },
  });

  React.useEffect(() => {
    if (mode === "edit") {
      wasEditing.current = true;
      form.setFocus("name");
    } else if (wasEditing.current) {
      wasEditing.current = false;
      editButtonRef.current?.focus();
    }
  }, [mode, form]);

  const startEdit = () => {
    form.reset({
      name: partner.name,
      governorate: partner.governorate,
      phone: partner.phone,
      linkedAgentId: partner.linkedAgentId ?? "",
    });
    setServerError(null);
    setMode("edit");
  };

  const cancelEdit = () => {
    setServerError(null);
    setMode("read");
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    setServerError(null);
    const body: Record<string, unknown> = {
      name: values.name.trim(),
      governorate: values.governorate.trim(),
      phone: values.phone.trim(),
    };
    if (partner.partnerType === "DISTRIBUTOR") {
      body.linkedAgentId = values.linkedAgentId || null;
    }
    const result = await patchPartner(partner.id, body);
    setSaving(false);
    if (result.success && result.data) {
      onUpdated(result.data);
      setMode("read");
    } else {
      setServerError(result.message ?? "تعذر الحفظ");
    }
  });

  const toggleActive = async () => {
    setTogglingActive(true);
    setToggleError(null);
    const result = await patchPartner(partner.id, { isActive: !partner.isActive });
    setTogglingActive(false);
    if (result.success && result.data) {
      onUpdated(result.data);
      setConfirmToggleOpen(false);
    } else {
      setToggleError(result.message ?? "تعذر تحديث حالة الحساب");
    }
  };

  if (mode === "read") {
    const linkedAgentName =
      partner.partnerType === "DISTRIBUTOR"
        ? agents.find((a) => a.id === partner.linkedAgentId)?.name ?? "—"
        : null;
    return (
      <div className="space-y-2 text-sm">
        <p>
          <strong>الاسم:</strong> {partner.name}
        </p>
        <p>
          <strong>المحافظة:</strong> {partner.governorate}
        </p>
        <p>
          <strong>رقم التليفون:</strong> {partner.phone}
        </p>
        {linkedAgentName !== null && (
          <p>
            <strong>الوكيل المرتبط:</strong> {linkedAgentName}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button ref={editButtonRef} type="button" size="sm" variant="outline" onClick={startEdit}>
            تعديل
          </Button>
          <Button
            type="button"
            size="sm"
            variant={partner.isActive ? "destructive" : "default"}
            onClick={() => {
              setToggleError(null);
              setConfirmToggleOpen(true);
            }}
          >
            {partner.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
          </Button>
        </div>

        <Dialog open={confirmToggleOpen} onOpenChange={(open) => !togglingActive && setConfirmToggleOpen(open)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle>{partner.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {partner.isActive
                ? "هل أنت متأكد من تعطيل حساب هذا الشريك؟ لن يتمكن من تسجيل الدخول إلى بوابته."
                : "هل أنت متأكد من تفعيل حساب هذا الشريك؟ سيتمكن من تسجيل الدخول إلى بوابته مجدداً."}
            </p>
            {toggleError && <p className="text-sm font-semibold text-destructive">{toggleError}</p>}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" disabled={togglingActive}>
                  إلغاء
                </Button>
              </DialogClose>
              <Button
                variant={partner.isActive ? "destructive" : "default"}
                onClick={toggleActive}
                disabled={togglingActive}
              >
                {togglingActive ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <div>
        <label htmlFor="partner-edit-name" className="mb-1 block text-sm font-medium">
          الاسم *
        </label>
        <Input id="partner-edit-name" {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="mt-1 text-xs font-semibold text-destructive">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="partner-edit-governorate" className="mb-1 block text-sm font-medium">
          المحافظة *
        </label>
        <Select
          id="partner-edit-governorate"
          {...form.register("governorate")}
          className="rounded-xl px-3"
        >
          <option value="">اختر المحافظة</option>
          {GOVERNORATE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {form.formState.errors.governorate && (
          <p className="mt-1 text-xs font-semibold text-destructive">{form.formState.errors.governorate.message}</p>
        )}
      </div>
      <div>
        <label htmlFor="partner-edit-phone" className="mb-1 block text-sm font-medium">
          رقم التليفون *
        </label>
        <Input id="partner-edit-phone" dir="ltr" {...form.register("phone")} />
        {form.formState.errors.phone && (
          <p className="mt-1 text-xs font-semibold text-destructive">{form.formState.errors.phone.message}</p>
        )}
      </div>
      {partner.partnerType === "DISTRIBUTOR" && (
        <div>
          <label htmlFor="partner-edit-linked-agent" className="mb-1 block text-sm font-medium">
            الوكيل المرتبط (اختياري)
          </label>
          <Select
            id="partner-edit-linked-agent"
            {...form.register("linkedAgentId")}
            className="rounded-xl px-3"
          >
            <option value="">— لا وكيل —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {serverError && <p className="text-sm font-semibold text-destructive">{serverError}</p>}
      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
