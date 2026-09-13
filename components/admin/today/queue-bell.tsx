"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAdminToday, type AdminTodayResponse } from "@/hooks/use-admin-today";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

/**
 * Admin topbar queue bell (backlog 9.2 e) — a red dot when the sum of the six اليوم queue
 * counts is > 0; opening it (Radix `DropdownMenu`) lists all six with their counts, each a
 * link to its view-all target. Reuses `useAdminToday()`, the same query the اليوم page
 * itself reads, so the bell's counts are always the API's own numbers.
 */
const QUEUES: { key: keyof AdminTodayResponse["queues"]; label: string; href: string }[] = [
  { key: "unassigned", label: "طلبات بلا شريك", href: "/admin/orders?partner=none" },
  { key: "overdue", label: "متأخرة عند الشريك", href: "/admin/orders?overdue=1" },
  { key: "tickets", label: "أسئلة بانتظار الرد", href: "/admin/order-tickets" },
  { key: "partnerRequests", label: "طلبات شراكة جديدة", href: "/admin/partners" },
  { key: "lowStock", label: "أصناف نافدة أو قاربت", href: "/admin/partner-inventory" },
  { key: "duePayments", label: "مستحقات شركاء", href: "/admin/partners" },
];

export function AdminQueueBell({ className }: { className?: string }) {
  const { data } = useAdminToday();
  const [open, setOpen] = React.useState(false);

  const total = data ? QUEUES.reduce((sum, q) => sum + data.queues[q.key].count, 0) : 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={total > 0 ? `طابور اليوم (${total} بحاجة لإجراء)` : "طابور اليوم"}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-ink transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
            className
          )}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          {total > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-carnelian-500 ring-2 ring-white"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel>طابور اليوم</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {QUEUES.map((q) => (
          <DropdownMenuItem key={q.key} asChild>
            <Link href={q.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">{q.label}</span>
              <span dir="ltr" className="text-xs font-extrabold text-ink-soft">
                {formatNumberEn(data?.queues[q.key].count ?? 0)}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
