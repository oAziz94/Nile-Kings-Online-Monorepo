"use client";

import { usePathname } from "next/navigation";
import { useCart } from "@/contexts/cart-context";
import { SiteNavbar, type SiteNavbarSection } from "@/components/shared/site-navbar";

/**
 * The `(public)` layout's navbar mount — backlog 4.6. Thin wrapper so `SiteNavbar` itself never
 * touches `useCart()` directly (it also renders inside `(auth)`, where `CartProvider` isn't
 * mounted); this component only exists inside `(public)`, where `CartProvider` always is.
 */
function currentSectionFromPath(pathname: string): SiteNavbarSection | undefined {
  if (pathname === "/cart" || pathname.startsWith("/cart/")) return "cart";
  if (pathname.startsWith("/profile")) return "account";
  return undefined;
}

export function PublicSiteNavbar() {
  const pathname = usePathname();
  const { cart } = useCart();
  return (
    <SiteNavbar
      current={currentSectionFromPath(pathname ?? "")}
      cartCount={cart?.itemCount}
      accountMenu
      sticky
    />
  );
}
