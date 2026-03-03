import { SeniorPromoToggle } from "./senior-promo-toggle";

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
      <p className="mt-2 text-muted-foreground">
        مرحباً، هذه لوحة إدارة نايل كينجز.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "إجمالي المبيعات", value: "—" },
          { label: "الطلبات", value: "—" },
          { label: "المنتجات", value: "—" },
          { label: "العملاء", value: "—" },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-6 shadow-subtle"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-subtle">
        <h2 className="text-lg font-semibold text-foreground">العروض</h2>
        <SeniorPromoToggle className="mt-4" />
      </section>
    </div>
  );
}
