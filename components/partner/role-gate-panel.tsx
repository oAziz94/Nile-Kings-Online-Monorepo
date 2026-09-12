import { ShieldAlert } from "lucide-react";

/**
 * Shared wrong-role panel (backlog partner-portal standing rule 5: "a wrong-role visit
 * renders an explicit 'هذه الصفحة متاحة للوكلاء فقط / للموزعين فقط' panel, not an empty
 * table"). First built for backlog 4.20 (role guards via `usePartnerMe()`); reusable by
 * later partner tasks (4.21's distributor role panel, etc.) rather than each page
 * hand-rolling its own copy.
 */
export function PartnerRoleGatePanel({ allowedRole }: { allowedRole: "AGENT" | "DISTRIBUTOR" }) {
  const label =
    allowedRole === "AGENT" ? "هذه الصفحة متاحة للوكلاء فقط" : "هذه الصفحة متاحة للموزعين فقط";
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-stone-200 bg-white px-6 py-16 text-center"
    >
      <ShieldAlert className="h-10 w-10 text-stone-300" strokeWidth={1.5} />
      <p className="text-base font-extrabold text-ink">{label}</p>
    </div>
  );
}
