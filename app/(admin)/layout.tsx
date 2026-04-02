import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, userHasAdminAccess } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/admin");
  if (!(await userHasAdminAccess(user))) redirect("/");

  const nav = [
    { href: "/admin", label: "لوحة التحكم" },
    { href: "/admin/analytics", label: "التحليلات" },
    { href: "/admin/products", label: "المنتجات" },
    { href: "/admin/categories", label: "الفئات" },
    { href: "/admin/coupons", label: "الكوبونات" },
    { href: "/admin/orders", label: "الطلبات" },
    { href: "/admin/rerouting-rules", label: "قواعد التوجيه" },
    { href: "/admin/routed-orders", label: "الطلبات الموجهة" },
    { href: "/admin/clients", label: "العملاء والمسؤولون" },
    { href: "/admin/partners", label: "شركاؤنا" },
    { href: "/admin/settings", label: "الإعدادات" },
  ];

  return (
    <div className="flex min-h-screen" dir="rtl">
      <aside className="w-56 border-l border-border bg-card p-4">
        <nav className="space-y-1">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block rounded-2xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
