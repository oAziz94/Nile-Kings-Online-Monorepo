"use client";

import * as React from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Shared collapsible-sidebar module (backlog 7.1) used by both `PartnerShell` (5.1) and
 * `AdminShell`. The collapsed/expanded *state* only drives the button icon, `aria-expanded`
 * and whether tooltips render — the actual narrow/wide styling is pure CSS, keyed off
 * `html[data-sidebar-collapsed="true"]` via the `sidebar-collapsed:` Tailwind variant
 * (see tailwind.config.ts), so a page reload while collapsed paints the narrow rail with no
 * width jump: `SidebarCollapseScript` below sets that attribute before first paint, and
 * `useSidebarCollapsed()`'s initial render (`useState(false)`) never has to "catch up" visually
 * because the CSS variant is already correct by the time React hydrates.
 */

export const SIDEBAR_COLLAPSED_KEY = "nk.sidebar.collapsed";

export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      // localStorage unavailable (private mode, disabled storage) — stay expanded.
    }
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        if (next) {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
        } else {
          window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
        }
      } catch {
        // ignore — state still flips, just won't persist across reloads.
      }
      if (next) {
        document.documentElement.dataset.sidebarCollapsed = "true";
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
      return next;
    });
  }, []);

  return { collapsed, toggle };
}

/**
 * Inline script, rendered as the *first child* of each dashboard shell, so the `<html>`
 * data attribute (and therefore the `sidebar-collapsed:` CSS variant) is set before the
 * shell's own markup paints. `suppressHydrationWarning` already covers `<html>`/`<body>`
 * (app/layout.tsx), so mismatching the attribute between server and client render is safe.
 */
export function SidebarCollapseScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{if(window.localStorage.getItem(${JSON.stringify(
          SIDEBAR_COLLAPSED_KEY
        )})==="1"){document.documentElement.dataset.sidebarCollapsed="true";}}catch(e){}`,
      }}
    />
  );
}

export function SidebarCollapseButton({
  collapsed,
  onToggle,
  navId,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  navId: string;
  className?: string;
}) {
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={navId}
      aria-label={collapsed ? "فتح القائمة" : "طيّ القائمة"}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-2 rounded-[10px] text-ink-soft transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
        "sidebar-collapsed:w-10 sidebar-collapsed:mx-auto",
        className
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
      <span className="sidebar-collapsed:hidden">{collapsed ? "فتح القائمة" : "طيّ القائمة"}</span>
    </button>
  );
}

/** Wraps `children` in a left-side tooltip, but only while `active` (collapsed) — used so the
 * expanded rail's markup for each nav item stays byte-for-byte unchanged. */
export function SidebarCollapseTooltip({
  active,
  label,
  children,
}: {
  active: boolean;
  label: string;
  children: React.ReactElement;
}) {
  if (!active) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
