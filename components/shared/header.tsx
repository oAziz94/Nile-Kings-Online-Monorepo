"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  User,
  Package,
  MapPin,
  LogOut,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/cart-context";
import { MenuDrawer } from "@/components/shared/menu-drawer";
import { cn } from "@/lib/utils";

export function Header() {
  const router = useRouter();
  const { openDrawer, cart } = useCart();
  const [user, setUser] = useState<{ name: string | null; phone: string } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const iconStroke = 1.5;

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-[100] w-full border-b border-border/80"
        style={{ backgroundColor: "#FEFEFE" }}
        role="banner"
      >
        {/* Layout direction LTR so left/center/right stay physical; RTL only affects text inside */}
        <div className="relative flex h-[80px] items-center justify-between gap-4 px-4 md:h-[92px] md:px-6" dir="ltr">
          {/* Left: Account (leftmost), Cart */}
          <div className="flex min-w-0 flex-1 items-center justify-start gap-3 sm:gap-4">
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
                  className="h-11 w-11 shrink-0 text-foreground/90 hover:bg-hover hover:text-foreground md:h-12 md:w-12"
                >
                  <User className="h-6 w-6" strokeWidth={iconStroke} />
                </Button>
                {profileOpen && (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-border bg-card py-2 shadow-xl ring-1 ring-black/5 rtl:left-0 rtl:right-auto"
                    role="menu"
                    dir="rtl"
                  >
                    <div className="px-3 py-1.5 text-sm font-medium text-muted-foreground">
                      {user.name?.trim() || user.phone || "حسابي"}
                    </div>
                    <Link
                      href="/profile/orders"
                      className="flex items-center gap-2 px-4 py-2.5 text-base text-foreground hover:bg-hover hover:text-hover-foreground"
                      onClick={() => setProfileOpen(false)}
                      role="menuitem"
                    >
                      <Package className="h-5 w-5 shrink-0" />
                      طلباتي
                    </Link>
                    <Link
                      href="/profile/addresses"
                      className="flex items-center gap-2 px-4 py-2.5 text-base text-foreground hover:bg-hover hover:text-hover-foreground"
                      onClick={() => setProfileOpen(false)}
                      role="menuitem"
                    >
                      <MapPin className="h-5 w-5 shrink-0" />
                      عناويني
                    </Link>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-base text-muted-foreground hover:bg-hover hover:text-hover-foreground text-right"
                      role="menuitem"
                    >
                      <LogOut className="h-5 w-5 shrink-0" />
                      تسجيل الخروج
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button variant="ghost" size="icon" asChild className="h-11 w-11 shrink-0 text-foreground/90 hover:bg-hover hover:text-foreground md:h-12 md:w-12">
                <Link href="/login" aria-label="تسجيل الدخول">
                  <User className="h-6 w-6" strokeWidth={iconStroke} />
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={openDrawer}
              aria-label="سلة التسوق"
              className="relative h-11 w-11 shrink-0 text-foreground/90 hover:bg-hover hover:text-foreground md:h-12 md:w-12"
            >
              <ShoppingCart className="h-6 w-6" strokeWidth={iconStroke} />
              {cart && cart.itemCount > 0 && (
                <span
                  className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {cart.itemCount > 99 ? "99+" : cart.itemCount}
                </span>
              )}
            </Button>
          </div>

          {/* Center: Logo — visually centered */}
          <div className="absolute left-1/2 top-1/2 flex min-w-0 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <Link
              href="/"
              className="flex shrink-0 items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              aria-label="نايل كينجز - الصفحة الرئيسية"
            >
              <Image
                src="/logo.png"
                alt="نايل كينجز"
                width={260}
                height={80}
                className="max-h-[60px] w-auto object-contain md:max-h-[76px]"
                priority
              />
            </Link>
          </div>

          {/* Right: Menu toggle — physical right */}
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(true)}
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              className="h-11 w-11 shrink-0 text-foreground/90 hover:bg-hover hover:text-foreground md:h-12 md:w-12"
            >
              <Menu className="h-6 w-6" strokeWidth={iconStroke} />
            </Button>
          </div>
        </div>
      </header>

      <MenuDrawer isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
