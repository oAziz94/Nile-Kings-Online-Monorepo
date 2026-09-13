"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, MapPin, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetCloseButton, SheetTitle } from "@/components/ui/sheet";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { isSavedAddressIncomplete } from "@/lib/addresses/completeness";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AddressCard } from "@/components/profile/address-card";
import { AddressFormFields } from "@/components/profile/address-form-fields";
import { emptyAddressForm, type AddressFormValues, type SavedAddress } from "@/components/profile/address-types";

const inkButtonClass = "h-12 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]";
const outlineButtonClass = "h-12 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)]";

const nonEmpty = (message: string) => z.string().refine((v) => v.trim().length > 0, { message });
const REQUIRED_MESSAGE = "المحافظة والمدينة والمنطقة والعنوان بالتفصيل والهاتف مطلوبة";

// Refine-only (not `.trim()` transform): the resolved `values` object must stay byte-identical to
// what the user typed — the wire payload trims only `city`, matching the pre-redesign client
// guard exactly (profile-addresses.md's "Client submit guard").
const addressFormSchema = z.object({
  label: z.string(),
  governorate: nonEmpty(REQUIRED_MESSAGE),
  city: nonEmpty(REQUIRED_MESSAGE),
  area: nonEmpty(REQUIRED_MESSAGE),
  street: nonEmpty(REQUIRED_MESSAGE),
  phone: nonEmpty(REQUIRED_MESSAGE),
  notes: z.string(),
  isDefault: z.boolean(),
});

const DESKTOP_QUERY = "(min-width: 1024px)";

function AddressesSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل العناوين" className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3.5 border border-[hsl(228_16%_84%)] bg-papyrus p-[22px_24px]">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function formatAddressOneLine(a: Pick<SavedAddress, "governorate" | "city" | "area" | "street">) {
  return [a.governorate, a.city, a.area, a.street].filter(Boolean).join("، ");
}

export default function ProfileAddressesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [list, setList] = React.useState<SavedAddress[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [profilePhone, setProfilePhone] = React.useState<string>("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const [focusCityOnOpen, setFocusCityOnOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<SavedAddress | null>(null);
  const [isDesktop, setIsDesktop] = React.useState(true);
  const submittingRef = React.useRef(false);

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    defaultValues: emptyAddressForm,
  });

  React.useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data?.phone) setProfilePhone(data.data.phone);
      })
      .catch(() => {});
  }, []);

  const load = React.useCallback(() => {
    fetch("/api/profile/addresses", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/addresses");
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: SavedAddress[] }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          const sorted = [...json.data].sort((a, b) => {
            const aIncomplete = isSavedAddressIncomplete(a) ? 0 : 1;
            const bIncomplete = isSavedAddressIncomplete(b) ? 0 : 1;
            return aIncomplete - bIncomplete;
          });
          setList(sorted);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  React.useEffect(() => load(), [load]);

  // Focus المدينة once the form is actually on screen — the desktop sheet mounts inside a
  // Radix portal (a tick after `showForm` flips), the mobile full-page state mounts inline.
  React.useEffect(() => {
    if (!showForm || !focusCityOnOpen || isDesktop) return;
    const id = window.setTimeout(() => form.setFocus("city"), 0);
    return () => window.clearTimeout(id);
  }, [showForm, focusCityOnOpen, isDesktop, form]);

  const openAdd = () => {
    setEditingId(null);
    setFocusCityOnOpen(false);
    form.reset({ ...emptyAddressForm, phone: profilePhone });
    setShowForm(true);
  };

  const openEdit = (a: SavedAddress, opts: { focusCity?: boolean } = {}) => {
    setEditingId(a.id);
    setFocusCityOnOpen(!!opts.focusCity);
    form.reset({
      label: a.label ?? "",
      governorate: a.governorate,
      city: a.city ?? "",
      area: a.area ?? "",
      street: a.street,
      notes: a.notes ?? "",
      phone: a.phone,
      isDefault: a.isDefault,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFocusCityOnOpen(false);
    form.reset(emptyAddressForm);
  };

  const onInvalid = () => {
    toast({ title: REQUIRED_MESSAGE, variant: "destructive" });
  };

  const onValid = async (values: AddressFormValues) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const body = {
      label: values.label || null,
      governorate: values.governorate,
      city: values.city.trim(),
      area: values.area || null,
      street: values.street,
      floor: null,
      apartment: null,
      notes: values.notes || null,
      phone: values.phone,
      isDefault: values.isDefault,
    };
    const url = editingId ? `/api/profile/addresses/${editingId}` : "/api/profile/addresses";
    const method = editingId ? "PATCH" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login?redirect=/profile/addresses");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (json?.success) {
        toast({ title: editingId ? "تم تحديث العنوان" : "تمت إضافة العنوان" });
        load();
        closeForm();
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const setDefault = async (id: string) => {
    const res = await fetch(`/api/profile/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.status === 401) {
      router.replace("/login?redirect=/profile/addresses");
      return;
    }
    const json = await parseJsonResponse<{ success?: boolean }>(res);
    if (json?.success) {
      toast({ title: "تم تعيين العنوان الافتراضي" });
      load();
    }
  };

  const confirmDelete = async () => {
    const address = pendingDelete;
    if (!address) return;
    const res = await fetch(`/api/profile/addresses/${address.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.status === 401) {
      router.replace("/login?redirect=/profile/addresses");
      return;
    }
    const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
    if (json?.success) {
      toast({ title: "تم حذف العنوان" });
      load();
      if (editingId === address.id) closeForm();
    } else {
      toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
    }
    setPendingDelete(null);
  };

  const formTitle = editingId ? "تعديل العنوان" : "عنوان جديد";
  const isSubmitting = form.formState.isSubmitting;

  const formBody = (
    <form
      id="address-form"
      onSubmit={form.handleSubmit(onValid, onInvalid)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
        <AddressFormFields idPrefix="address" register={form.register} />
      </div>
      <div className="flex gap-3 border-t border-[hsl(228_16%_84%)] p-6 lg:p-8 lg:pt-[22px]">
        <Button type="submit" disabled={isSubmitting} className={cn(inkButtonClass, "flex-1 lg:flex-none")}>
          {isSubmitting ? "جارٍ الحفظ…" : "حفظ العنوان"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={closeForm}
          className={cn(outlineButtonClass, "flex-1 lg:flex-none")}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );

  return (
    <div>
      {(!showForm || isDesktop) && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-amiri text-[26px] font-bold text-[hsl(228_40%_14%)]">عناويني</h2>
              <p className="mt-1 font-plex-arabic text-[13.5px] text-[hsl(228_18%_45%)]">
                العنوان الافتراضي يُختار تلقائيًا عند الدفع.
              </p>
            </div>
            <Button onClick={openAdd} className={inkButtonClass}>
              <Plus className="h-4 w-4" strokeWidth={1.3} />
              عنوان جديد
            </Button>
          </div>

          {loading ? (
            <AddressesSkeleton />
          ) : list.length === 0 ? (
            <EmptyState
              className="mt-6 border-solid"
              icon={<MapPin className="h-8 w-8 text-gold-600" strokeWidth={1.3} />}
              title="لا توجد عناوين محفوظة."
              description="احفظ عنوانًا مرة واحدة واختره عند الدفع بضغطة."
              action={
                <Button onClick={openAdd} className={inkButtonClass}>
                  <Plus className="h-4 w-4" strokeWidth={1.3} />
                  إضافة عنوان
                </Button>
              }
            />
          ) : (
            <>
              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {list.map((a) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    onEdit={() => openEdit(a)}
                    onCompleteAddress={() => openEdit(a, { focusCity: true })}
                    onSetDefault={() => setDefault(a.id)}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </div>
              <p className="mt-6 flex items-center gap-2 font-plex-arabic text-[13px] text-[hsl(228_18%_45%)]">
                <MapPin className="h-4 w-4" strokeWidth={1.3} />
                رسوم الشحن تُحسب حسب المحافظة. المدينة والمنطقة لعنوان المندوب فقط.
              </p>
            </>
          )}
        </>
      )}

      {/* Below `lg`: the form replaces the list entirely (full-page state with a back control). */}
      {showForm && !isDesktop && (
        <div>
          <div className="mb-5 flex items-center gap-2.5">
            <button
              type="button"
              aria-label="رجوع"
              onClick={closeForm}
              className="grid h-10 w-10 place-items-center border border-[hsl(228_16%_84%)] text-[hsl(228_40%_14%)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.3} />
            </button>
            <h2 className="font-amiri text-[26px] font-bold text-[hsl(228_40%_14%)]">{formTitle}</h2>
          </div>
          {formBody}
        </div>
      )}

      {/* `lg+`: the form is a 560px side sheet anchored at the inline start (physical right in
          this always-RTL storefront — matches the shipped cart drawer's `side="right"`). */}
      {isDesktop && (
        <Sheet
          open={showForm}
          onOpenChange={(open) => {
            if (!open) closeForm();
          }}
        >
          <SheetContent
            side="right"
            className="w-full max-w-[560px] gap-0 bg-[#F7F4EE] p-0 sm:max-w-[560px]"
            onOpenAutoFocus={(e) => {
              if (focusCityOnOpen) {
                e.preventDefault();
                window.setTimeout(() => form.setFocus("city"), 0);
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-[hsl(228_16%_84%)] p-6">
              <div>
                <SheetTitle className="text-[26px]">{formTitle}</SheetTitle>
                <p className="mt-0.5 font-plex-arabic text-[13px] text-[hsl(228_18%_45%)]">
                  الحقول المعلّمة مطلوبة لحساب الشحن والتوصيل.
                </p>
              </div>
              <SheetCloseButton />
            </div>
            {formBody}
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="rounded-none border border-[hsl(228_16%_84%)] bg-papyrus">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">
              {pendingDelete?.label ? `حذف عنوان «${pendingDelete.label}»؟` : "حذف هذا العنوان؟"}
            </DialogTitle>
            <DialogDescription className="text-[hsl(228_18%_45%)]">
              {pendingDelete && formatAddressOneLine(pendingDelete)}
              <br />
              لا يمكن التراجع عن الحذف. الطلبات السابقة تحتفظ بعنوانها.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              className="h-11 gap-2 rounded-none border-[hsl(6_58%_42%)] bg-[hsl(6_58%_42%)] text-papyrus hover:bg-[hsl(6_58%_36%)]"
              onClick={confirmDelete}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.3} />
              حذف العنوان
            </Button>
            <Button
              variant="outline"
              className={cn(outlineButtonClass, "h-11")}
              onClick={() => setPendingDelete(null)}
            >
              إبقاؤه
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
