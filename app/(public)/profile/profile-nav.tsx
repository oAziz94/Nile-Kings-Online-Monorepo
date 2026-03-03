"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, MapPin, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/profile/orders", label: "طلباتي", icon: Package },
  { href: "/profile/addresses", label: "عناويني", icon: MapPin },
  { href: "/profile/senior", label: "أصحاب المعاشات", icon: BadgeCheck },
];

export function ProfileNav() {
  const pathname = usePathname();
  const [seniorVerified, setSeniorVerified] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    fetch("/api/profile/senior", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { seniorVerified: boolean } }) => {
        if (json?.success && typeof json.data?.seniorVerified === "boolean") {
          setSeniorVerified(json.data.seniorVerified);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-3">
      {seniorVerified === true && (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          role="status"
        >
          <BadgeCheck className="mx-auto h-5 w-5 mb-1" />
          <span>عضو معتمد أصحاب المعاشات</span>
        </div>
      )}
      <nav className="flex flex-row gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-2 md:flex-col md:overflow-visible">
        {nav.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/profile" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
