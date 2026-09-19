"use client";

import * as React from "react";
import { parseJsonResponse } from "@/lib/api/parse-json";
import type { AuthMeData } from "@/lib/storefront/bootstrap/auth-me";
import type { GovernorateBootstrapData } from "@/lib/storefront/bootstrap/governorate";
import type { CouponPopupMessagesData } from "@/lib/storefront/bootstrap/coupon-messages";
import type { Cart } from "@/contexts/cart-context";

/**
 * `GET /api/storefront/bootstrap` (backlog 6.2), fetched once per full page load and shared by
 * `GovernorateSelector`, `CouponPromoDialog`, `SiteNavbar`/`MenuDrawer` and `CartProvider` so
 * none of them fires its own first fetch for data this one request already carries. Each of them
 * still owns its own later fetches (save address, add/remove cart item, logout, drawer refresh,
 * orders summary) exactly as before.
 */
export type StorefrontBootstrapData = {
  user: AuthMeData | null;
  governorate: GovernorateBootstrapData;
  couponMessages: CouponPopupMessagesData;
  cart: Cart | null;
};

export type StorefrontBootstrapStatus = "loading" | "ready" | "error";

type StorefrontBootstrapContextValue = {
  data: StorefrontBootstrapData | null;
  status: StorefrontBootstrapStatus;
  refresh: () => Promise<void>;
};

const StorefrontBootstrapContext = React.createContext<StorefrontBootstrapContextValue | null>(
  null
);

export function StorefrontBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<StorefrontBootstrapData | null>(null);
  const [status, setStatus] = React.useState<StorefrontBootstrapStatus>("loading");

  const refresh = React.useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/storefront/bootstrap", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await parseJsonResponse<{
        success?: boolean;
        data?: StorefrontBootstrapData;
      }>(res);
      if (json?.success && json.data) {
        setData(json.data);
        setStatus("ready");
      } else {
        setData(null);
        setStatus("error");
      }
    } catch {
      setData(null);
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = React.useMemo(
    () => ({ data, status, refresh }),
    [data, status, refresh]
  );

  return (
    <StorefrontBootstrapContext.Provider value={value}>
      {children}
    </StorefrontBootstrapContext.Provider>
  );
}

export function useStorefrontBootstrap(): StorefrontBootstrapContextValue {
  const ctx = React.useContext(StorefrontBootstrapContext);
  if (!ctx) {
    throw new Error("useStorefrontBootstrap must be used within StorefrontBootstrapProvider");
  }
  return ctx;
}
