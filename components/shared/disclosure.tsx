"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Minimal accessible disclosure (accordion item) — `@radix-ui/react-accordion` is not an
 * approved/installed dependency (`04-decisions.md`), so this is a small `aria-expanded`/
 * `aria-controls` disclosure per the canvas's own accordion markup (PDP artboards 1g/1h),
 * one instance per section, independently toggled (canvas opens the first one by default).
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled variant (e.g. auto-closing the mobile legal TOC after a link click). Omit for the
   * existing uncontrolled usage (PDP's description/shipping/returns/payment accordions). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(open) : next;
    if (!isControlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  };
  const panelId = useId();

  return (
    <div className="border-b border-[hsl(228_16%_84%)]">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 py-4 text-start font-plex-arabic text-[15px] font-medium text-[hsl(228_40%_14%)]"
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-transform motion-reduce:transition-none",
              open && "rotate-180"
            )}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="pb-5 text-sm leading-7 text-[hsl(228_18%_32%)]">
          {children}
        </div>
      )}
    </div>
  );
}
