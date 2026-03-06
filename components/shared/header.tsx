"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, ShoppingCart, User, Package, MapPin, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

export function Header() {
  const router = useRouter();
  const { openDrawer, cart } = useCart();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<{ name: string | null; phone: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.value =
        new URLSearchParams(window.location.search).get("q") ?? "";
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          setUser(null);
          return;
        }
        const data = await res.json();
        setUser({ name: data.data?.name ?? null, phone: data.data?.phone ?? "" });
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      const t = setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
      return () => {
        clearTimeout(t);
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [profileOpen]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setProfileOpen(false);
    router.refresh();
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 w-full bg-white">
      <div className="container flex h-[72px] items-center gap-4 px-4 md:gap-6">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/logo.png"
            alt="نايل كينجز"
            width={180}
            height={64}
            className="h-12 w-auto object-contain md:h-14"
            priority
          />
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2 md:justify-between md:gap-4">
          <nav className="hidden md:flex md:gap-6">
            <Link
              href="/products"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              المتجر
            </Link>
            <Link
              href="/categories"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              التصنيفات
            </Link>
          </nav>

          <form
            action="/search"
            method="get"
            className="flex flex-1 items-center gap-2 md:max-w-sm md:flex-initial"
          >
            <div className="relative w-full">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="search"
                name="q"
                placeholder="ابحث عن منتج..."
                className="w-full rounded-2xl pr-10 pl-4"
                defaultValue=""
              />
            </div>
          </form>

          <div className="flex items-center gap-1">
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={openDrawer}
                aria-label="سلة التسوق"
              >
                <ShoppingCart className="h-5 w-5" />
              </Button>
              {cart && cart.itemCount > 0 && (
                <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {cart.itemCount > 99 ? "99+" : cart.itemCount}
                </span>
              )}
            </div>

            {user ? (
              <div className="relative z-[100]" ref={profileRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProfileOpen((o) => !o);
                  }}
                  aria-label="حسابي"
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                >
                  <User className="h-5 w-5" />
                </Button>
                {profileOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-card py-2 shadow-xl ring-1 ring-black/5 dark:ring-white/10 rtl:left-0 rtl:right-auto"
                    role="menu"
                  >
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      {user.name?.trim() || user.phone || "حسابي"}
                    </div>
                    <Link
                      href="/profile/orders"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/80"
                      onClick={() => setProfileOpen(false)}
                      role="menuitem"
                    >
                      <Package className="h-4 w-4 shrink-0" />
                      طلباتي
                    </Link>
                    <Link
                      href="/profile/addresses"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted/80"
                      onClick={() => setProfileOpen(false)}
                      role="menuitem"
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      عناويني
                    </Link>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 hover:text-foreground text-right"
                      role="menuitem"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button variant="ghost" size="icon" asChild>
                <Link href="/login" aria-label="تسجيل الدخول">
                  <User className="h-5 w-5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
