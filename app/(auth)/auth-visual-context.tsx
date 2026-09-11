"use client";

/**
 * Lets a deeply-nested form step (e.g. forgot-password's "password" step) tell the shared
 * `(auth)` layout which cotton photography crop to show as the hero, without lifting the whole
 * wizard's step state up into the layout. Per the canvas: cotton-weave is the default hero for
 * login/register/OTP; cotton-drape ("draped bed linen") is used specifically for
 * forgot-password's new-password step (docs/redesign/design-canvas/Auth Surface v2.dc.html,
 * screen 2f — "linen crop, does not auto-login").
 *
 * Only the variant is shared state — no business logic crosses this boundary.
 */
import { createContext, useContext, useMemo, useState } from "react";

export type AuthHeroVariant = "weave" | "drape";

interface AuthVisualState {
  variant: AuthHeroVariant;
  setVariant: (variant: AuthHeroVariant) => void;
}

const AuthVisualContext = createContext<AuthVisualState | null>(null);

export function AuthVisualProvider({ children }: { children: React.ReactNode }) {
  // Per the user's 2026-09-11 follow-up the bed-linen photograph (drape) is the hero on
  // login/register/OTP; the macro weave moves to forgot-password's new-password step.
  const [variant, setVariant] = useState<AuthHeroVariant>("drape");
  const value = useMemo(() => ({ variant, setVariant }), [variant]);
  return <AuthVisualContext.Provider value={value}>{children}</AuthVisualContext.Provider>;
}

export function useAuthVisual(): AuthVisualState {
  const ctx = useContext(AuthVisualContext);
  if (!ctx) {
    throw new Error("useAuthVisual must be used within AuthVisualProvider");
  }
  return ctx;
}
