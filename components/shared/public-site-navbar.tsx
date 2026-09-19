"use client";

import { usePathname } from "next/navigation";
import { useCart } from "@/contexts/cart-context";
import { useStorefrontBootstrap } from "@/components/storefront/storefront-bootstrap-provider";
import { SiteNavbar, type SiteNavbarSection } from "@/components/shared/site-navbar";

/**
 * The `(public)` layout's navbar mount — backlog 4.6. Thin wrapper so `SiteNavbar` itself never
 * touches `useCart()` directly (it also renders inside `(auth)`, where `CartProvider` isn't
 * mounted); this component only exists inside `(public)`, where `CartProvider` always is.
 *
 * Backlog 6.2: same reasoning for `useStorefrontBootstrap()` — read here, passed down as a plain
 * prop, so `SiteNavbar` never fetches `/api/auth/me` itself on the storefront.
 */
function currentSectionFromPath(pathname: string): SiteNavbarSection | undefined {
  if (pathname === "/cart" || pathname.startsWith("/cart/")) return "cart";
  if (pathname.startsWith("/profile")) return "account";
  return undefined;
}

export function PublicSiteNavbar() {
  const pathname = usePathname();
  const { cart } = useCart();
  const bootstrap = useStorefrontBootstrap();
  const bootstrapUser = bootstrap.status === "ready" ? bootstrap.data?.user ?? null : undefined;
  return (
    <SiteNavbar
      current={currentSectionFromPath(pathname ?? "")}
      cartCount={cart?.itemCount}
      accountMenu
      useBootstrapUser
      bootstrapUser={bootstrapUser}
      search
      sticky
      transparent={pathname === "/"}
    />
  );
}
