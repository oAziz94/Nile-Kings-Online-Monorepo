"use client";

/**
 * Small shared presentational primitives for the Auth surface visual refresh (backlog 4.5),
 * translating the design canvas's literal inline styles
 * (docs/redesign/design-canvas/Auth Surface v2.dc.html) into reusable Tailwind/CSS: radius-0
 * hairline fields, flush-start labels, the gold hairline rule before every primary action, and
 * the primary button's trailing Ankh mark. Presentation only — no auth/business logic here.
 *
 * Every interactive element here gets an explicit `focus-visible:ring-*` (visible focus state,
 * design-system requirement — see docs/redesign/01-design-system.md's accessibility section),
 * since these are hand-rolled elements, not `components/ui/button.tsx`'s/`input.tsx`'s shared
 * primitives (which already had one) — regression-tested by `tests/e2e/auth-*.spec.ts`'s
 * "keyboard reachability and a visible focus state" checks.
 */
import * as React from "react";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Ankh } from "@/components/brand/ankh";

const authFocusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus";

/** Canvas: `font:500 12.5px 'IBM Plex Sans Arabic';letter-spacing:.04em;color:hsl(228 14% 42%)` */
export const authLabelClass =
  "font-plex-arabic text-[12.5px] font-medium tracking-[0.04em] text-[hsl(228_14%_42%)]";

/** The bordered, radius-0 "field box" every input/select sits inside — canvas's hairline field. */
export function authFieldBoxClass(hasError?: boolean): string {
  return cn(
    "flex h-[52px] rounded-none border bg-transparent transition-colors focus-within:border-2",
    hasError
      ? "border-[hsl(6_58%_42%)] bg-[hsl(6_60%_98%)] focus-within:border-[hsl(6_58%_42%)]"
      : "border-[hsl(40_12%_70%)] focus-within:border-[hsl(228_40%_14%)] focus-within:border-b-[hsl(42_78%_55%)]"
  );
}

/**
 * Bare `<input>` styling once it's inside `authFieldBoxClass` (no own border/radius) — still
 * carries its own focus-visible ring (not just the wrapper's `focus-within` border swap) so a
 * keyboard user gets a real visible-focus indicator on the input itself.
 */
export const authBareInputClass = cn(
  // `w-0 min-w-0 flex-1` (not `w-full flex-1`): a flex item that is BOTH `w-full` (width:100%)
  // AND `flex-1` fights its own shrink — the browser sizes it to 100% of the flex container
  // before the sibling (country-select / show-password button) claims its own space, so the
  // pair overflows the field box and the input's real content clips, worse once
  // `focus-within:border-2` adds width. Same root cause, same fix, as the OTP-box overflow
  // bug fixed in backlog 4.5 (components/auth/otp-boxes.tsx) — see 04-decisions.md.
  "h-[52px] w-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3.5 text-right font-archivo text-[16px] tracking-[0.03em] text-[hsl(228_40%_14%)] placeholder:text-[hsl(228_8%_65%)]",
  authFocusRingClass
);

export const authBareSelectClass = cn(
  "h-[52px] flex-none cursor-pointer rounded-none border-0 border-r border-[hsl(40_12%_70%)] bg-transparent px-3.5 font-archivo text-[14px] font-medium text-[hsl(228_40%_14%)]",
  authFocusRingClass
);

/** Canvas: the thin gold rule that always separates the last field from the primary action. */
export function AuthDivider({ className }: { className?: string }) {
  return <div className={cn("h-px bg-[hsl(42_78%_55%)] opacity-55", className)} />;
}

export type AuthSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** Canvas's lapis primary button with the trailing gold Ankh mark (`stroke-width:9`, small size). */
export const AuthSubmitButton = forwardRef<HTMLButtonElement, AuthSubmitButtonProps>(
  function AuthSubmitButton({ className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="submit"
        {...props}
        className={cn(
          "flex h-14 w-full items-center justify-between rounded-none bg-[hsl(228_40%_14%)] px-5 font-plex-arabic text-[15px] font-semibold text-papyrus transition-colors hover:bg-[hsl(228_30%_26%)] disabled:cursor-not-allowed disabled:opacity-60",
          authFocusRingClass,
          className
        )}
      >
        <span>{children}</span>
        <Ankh size={22} strokeWidth={9} className="shrink-0 text-gold-500" />
      </button>
    );
  }
);

/** Canvas's mobile secondary action (login's "إنشاء حساب جديد") — outline, no Ankh. */
export const AuthOutlineButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function AuthOutlineButton({ className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        {...props}
        className={cn(
          "flex h-14 w-full items-center justify-center rounded-none border border-[hsl(228_40%_14%)] bg-transparent px-5 font-plex-arabic text-[15px] font-semibold text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(228_40%_14%)]/5",
          authFocusRingClass,
          className
        )}
      >
        {children}
      </button>
    );
  }
);

export interface PasswordFieldBoxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * A field box containing a password input plus the canvas's inline "إظهار/إخفاء" visibility
 * toggle. The toggle's accessible name deliberately avoids repeating "كلمة المرور" /
 * "تأكيد كلمة المرور" (whatever the field's own label says) as a literal substring — Playwright
 * (and other accessible-name tooling) resolves `getByLabel(...)` against ANY element whose
 * aria-label contains the search text, so a toggle button labelled e.g. "إظهار كلمة المرور" sitting
 * next to a field actually labelled "كلمة المرور" collides with that field's own label lookup.
 */
export const PasswordFieldBox = forwardRef<HTMLInputElement, PasswordFieldBoxProps>(
  function PasswordFieldBox({ className, error, ...props }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className={cn(authFieldBoxClass(error), "items-center justify-between pl-3.5")}>
        <input
          ref={ref}
          type={show ? "text" : "password"}
          dir="ltr"
          {...props}
          className={cn(authBareInputClass, "tracking-[0.3em]", className)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className={cn(
            "shrink-0 whitespace-nowrap px-3.5 font-plex-arabic text-xs font-medium text-gold-600 hover:underline",
            authFocusRingClass
          )}
          aria-label={show ? "إخفاء قيمة الحقل المُدخلة" : "إظهار قيمة الحقل المُدخلة"}
        >
          {show ? "إخفاء" : "إظهار"}
        </button>
      </div>
    );
  }
);
