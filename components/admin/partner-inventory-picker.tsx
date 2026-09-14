"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Select } from "@/components/ui/select";

type PartnerOption = { id: string; name: string; phone: string; partnerType: string; governorate: string };

/** Picking a partner here navigates straight to their profile's المخزون tab — see the
 * page's doc comment for why this page still exists at all. */
export function PartnerInventoryPicker() {
  const router = useRouter();
  const [partners, setPartners] = React.useState<PartnerOption[]>([]);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=200", { credentials: "include" }).then((r) => r.json()),
    ]).then(([a, b]) => {
      setPartners([...(a?.data?.partners ?? []), ...(b?.data?.partners ?? [])]);
    });
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="مخزون الشركاء" description="اختر شريكاً للانتقال إلى مخزونه في ملفه." />
      <PanelCard title="الشريك" icon={<Warehouse className="h-5 w-5 text-lapis-800" />}>
        <div className="max-w-md">
          <Select onChange={(e) => e.target.value && router.push(`/admin/partners/${e.target.value}?tab=stock`)} defaultValue="">
            <option value="">اختر الشريك لعرض مخزونه</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name} · {partner.partnerType === "AGENT" ? "وكيل" : "موزع"} · {partner.governorate}
              </option>
            ))}
          </Select>
        </div>
      </PanelCard>
    </div>
  );
}
