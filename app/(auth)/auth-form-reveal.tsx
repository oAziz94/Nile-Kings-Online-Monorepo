"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the (auth) form column so a route change inside the group (login ⇄ register ⇄
 * forgot-password) re-mounts the column and replays one short rise — the "subtle page-state
 * transition" from the art-direction brief, instead of the new form simply popping in under the
 * unchanged photography. The layout itself persists across those navigations (one Next.js layout
 * instance), which is exactly why the key has to come from the pathname and not from the layout.
 *
 * Purely presentational; the animation is defined and reduced-motion-guarded in auth-motion.css.
 */
export function AuthFormReveal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="nk-rise-soft flex w-full flex-1 flex-col">
      {children}
    </div>
  );
}
