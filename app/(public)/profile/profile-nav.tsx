"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/profile/orders", label: "طلباتي", icon: Package },
  { href: "/profile/addresses", label: "عناويني", icon: MapPin },
];

export function ProfileNav() {
  const pathname = usePathname();

  return (
    <div className="space-y-3">
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
