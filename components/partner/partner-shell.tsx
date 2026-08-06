"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { BarChart3, Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, PackageSearch, Truck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PartnerIdentity = {
  name: string;
  phone: string;
  partnerType: "AGENT" | "DISTRIBUTOR";
};

const AGENT_NAV_ITEMS = [
  { href: "/partner/products", label: "مخزون المنتجات", icon: PackageSearch },
  { href: "/partner/routed-orders", label: "الطلبات", icon: Truck },
  { href: "/partner/distributors", label: "الموزعون", icon: Users },
  { href: "/partner/distributor-requests", label: "طلبات الموزعين", icon: ClipboardList },
  { href: "/partner/reports", label: "التقارير", icon: BarChart3 },
] as const;

const DISTRIBUTOR_NAV_ITEMS = [
  { href: "/partner/products", label: "مخزون المنتجات", icon: PackageSearch },
  { href: "/partner/routed-orders", label: "الطلبات", icon: Truck },
  { href: "/partner/restock-requests", label: "طلب إعادة توريد", icon: ClipboardList },
] as const;

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PartnerNavLinks({
  pathname,
  partnerType,
  onNavigate,
}: {
  pathname: string;
  partnerType: "AGENT" | "DISTRIBUTOR" | null;
  onNavigate?: () => void;
}) {
  const navItems = partnerType === "DISTRIBUTOR" ? DISTRIBUTOR_NAV_ITEMS : AGENT_NAV_ITEMS;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          الرئيسية
        </p>
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-foreground text-primary-foreground hover:text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          الحساب
        </p>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          المتجر
        </Link>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}

function PartnerNavDrawer({
  isOpen,
  onClose,
  pathname,
  partnerType,
}: {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
  partnerType: "AGENT" | "DISTRIBUTOR" | null;
}) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40 lg:hidden" aria-hidden onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="قائمة لوحة الشريك"
        className={cn(
          "fixed top-0 bottom-0 z-[100] flex w-[min(18rem,88vw)] flex-col",
          "right-0 left-auto border-l border-border bg-card shadow-lg",
          "animate-in slide-in-from-right duration-300 ease-out lg:hidden"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-foreground">Nile Kings</p>
            <p className="text-xs text-muted-foreground">Partner</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="h-9 w-9 shrink-0 rounded-md"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <PartnerNavLinks pathname={pathname} partnerType={partnerType} onNavigate={onClose} />
        </nav>
      </aside>
    </>
  );
}

export function PartnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = React.useState(false);
  const [partnerType, setPartnerType] = React.useState<"AGENT" | "DISTRIBUTOR" | null>(null);
  const [identity, setIdentity] = React.useState<PartnerIdentity | null>(null);

  React.useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/partner/me", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        const partner = json?.data?.partner;
        const type = partner?.partnerType;
        if (alive && (type === "AGENT" || type === "DISTRIBUTOR")) {
          setPartnerType(type);
          setIdentity({
            name: partner.name ?? "Partner",
            phone: partner.phone ?? "",
            partnerType: type,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const partnerTypeLabel =
    identity?.partnerType === "DISTRIBUTOR" ? "Distributor" : "Agent";
  const displayName = identity?.name?.trim() || identity?.phone || "Partner";

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row" dir="rtl">
      <header className="sticky top-0 z-50 flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3 lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-md"
          onClick={() => setNavOpen(true)}
          aria-label="فتح قائمة لوحة الشريك"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Boxes className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">Nile Kings {partnerTypeLabel}</p>
        </div>
      </header>

      <PartnerNavDrawer
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        pathname={pathname}
        partnerType={partnerType}
      />

      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-l border-border bg-card lg:flex">
        <div className="border-b border-border px-5 py-4">
          <p className="text-base font-bold text-foreground">Nile Kings</p>
          <p className="text-xs text-muted-foreground">Partner</p>
          <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {identity?.phone || partnerTypeLabel}
            </p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <PartnerNavLinks pathname={pathname} partnerType={partnerType} />
        </nav>
      </aside>

      <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:overflow-auto lg:p-6">
        {children}
      </main>
    </div>
  );
}
