import { Truck, Leaf, Ruler, ShieldCheck } from "lucide-react";

/**
 * Home trust bar — backlog 4.7. Four claims that are true today, per `04-decisions.md`
 * 2026-09-12 standing rule 1 (no invented numbers) and rule 2 (no free-shipping claim): shipping
 * is cost-calculated at checkout by governorate, not a day-count promise.
 */
const TRUST_ITEMS = [
  { icon: Truck, title: "شحن لكل المحافظات", sub: "يُحسب عند الدفع حسب المحافظة" },
  { icon: Leaf, title: "قطن مصري 100%", sub: "طويل التيلة، مغزول ومنسوج في مصر" },
  { icon: Ruler, title: "مقاسات كبيرة", sub: "قصّات مريحة حتى المقاسات الكبيرة" },
  { icon: ShieldCheck, title: "الدفع عند الاستلام أو إنستاباي", sub: "لا نحفظ أي بيانات بطاقات" },
] as const;

export function TrustBar() {
  return (
    <ul
      aria-label="سياساتنا"
      className="grid grid-cols-1 list-none border-y border-[hsl(228_40%_14%)]/16 p-0 sm:grid-cols-2 lg:grid-cols-4"
    >
      {TRUST_ITEMS.map(({ icon: Icon, title, sub }) => (
        <li
          key={title}
          className="flex items-center gap-3.5 border-b border-[hsl(228_40%_14%)]/10 p-4 last:border-b-0 sm:border-b sm:p-5 lg:gap-4 lg:border-b-0 lg:border-s lg:border-[hsl(228_40%_14%)]/12 lg:first:border-s-0 lg:py-5"
        >
          <Icon aria-hidden className="h-5 w-5 shrink-0 text-[hsl(228_40%_14%)] lg:h-6 lg:w-6" strokeWidth={1.3} />
          <span className="text-xs leading-snug sm:text-sm">
            <b className="block font-semibold text-[hsl(228_40%_14%)]">{title}</b>
            <span className="text-[hsl(228_18%_45%)]">{sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
