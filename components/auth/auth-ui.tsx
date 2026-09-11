"use client";

/**
 * Shared presentational primitives for the Auth surface (backlog 4.5, refined 2026-09-11 per the
 * user's art-direction brief — docs/redesign/04-decisions.md "4.5 refinement: art direction").
 * Radius-0 hairline fields, flush-start labels, a short gold rule before the primary action, and
 * a plain lapis primary button. Presentation only — no auth/business logic here.
 *
 * Every interactive element gets an explicit `focus-visible:ring-*` (design-system accessibility
 * requirement) since these are hand-rolled elements, not the shared ui/button + ui/input
 * primitives — regression-tested by tests/e2e/auth-*.spec.ts's keyboard-reachability checks.
 */
import * as React from "react";
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

const authFocusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus";

/**
 * Focus indicator for controls that live INSIDE a field box (the number input, the country
 * select): the box itself already turns to a 2px ink rule with a gold foot on `focus-within`, so
 * the control's own indicator is a gold underline drawn inside its area — still a real, visible
 * box-shadow on the focused element (tests/e2e/auth-*.spec.ts assert `boxShadow !== "none"`),
 * without a second, gold rectangle fighting the box's ink rule.
 */
const authInsetFocusClass =
  "focus-visible:outline-none focus-visible:shadow-[inset_0_-2px_0_hsl(42_78%_55%)]";

/** Field label — one notch larger and darker than the canvas's 12.5px so it holds its own next to 17px inputs. */
export const authLabelClass =
  "font-plex-arabic text-[13px] font-medium tracking-[0.03em] text-[hsl(228_14%_38%)]";

/** Helper line under a field — product information (e.g. "the code goes to WhatsApp"), not decoration. */
export const authHelpClass = "font-plex-arabic text-[12.5px] leading-[1.7] text-[hsl(228_12%_46%)]";

/**
 * The bordered, radius-0 field box every input/select sits inside. Focus is a colour change plus
 * a 1px inset shadow (reads as a 2px ink rule without the layout shift a real `border-2` swap
 * causes) and the gold hairline along the bottom edge.
 */
export function authFieldBoxClass(hasError?: boolean): string {
  return cn(
    "flex h-[58px] rounded-none border bg-transparent transition-[border-color,box-shadow] duration-200 lg:h-14",
    hasError
      ? "border-[hsl(6_58%_42%)] bg-[hsl(6_60%_98%)] focus-within:border-[hsl(6_58%_42%)]"
      : "border-[hsl(40_12%_72%)] focus-within:border-[hsl(228_40%_14%)] focus-within:border-b-[hsl(42_78%_55%)] focus-within:shadow-[inset_0_0_0_1px_hsl(228_40%_14%)]"
  );
}

/**
 * Bare `<input>` inside `authFieldBoxClass` (no own border/radius) — still carries its own
 * focus-visible ring so a keyboard user gets a real indicator on the input itself.
 *
 * `w-0 min-w-0 flex-1` (not `w-full flex-1`): a flex item that is BOTH width:100% AND flex-1
 * fights its own shrink and overflows the box once a sibling (country select / show-password
 * button) claims space — same root cause as the OTP-box overflow bug, see 04-decisions.md.
 * `text-right` keeps the visible text/caret on the RTL page's reading edge even though the
 * control itself is `dir="ltr"` so multi-digit numbers never reverse.
 */
export const authBareInputClass = cn(
  "h-full w-0 min-w-0 flex-1 rounded-none border-0 bg-transparent px-4 text-right font-archivo text-[17px] tracking-[0.02em] text-[hsl(228_40%_14%)] placeholder:text-[hsl(228_8%_66%)]",
  authInsetFocusClass
);

// The canvas's own 10×6 chevron, drawn by the select itself so the native arrow never shows.
const selectChevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='hsl(228 14%25 45%25)' stroke-width='1.2'/%3E%3C/svg%3E\")";

/**
 * The country-code select at the inline end of the phone field. Borderless — the divider against
 * the number input is `AuthFieldDivider`, an inset hairline, so the pair reads as one refined
 * control instead of two cells of a table. `dir="ltr"` keeps "+20 مصر" reading as a code-first unit.
 */
export const authBareSelectClass = cn(
  "h-full flex-none cursor-pointer appearance-none rounded-none border-0 bg-transparent bg-no-repeat py-0 pl-3.5 pr-7 font-archivo text-[14.5px] font-medium text-[hsl(228_40%_14%)]",
  "bg-[position:right_12px_center]",
  authInsetFocusClass
);
export const authBareSelectStyle: React.CSSProperties = { backgroundImage: selectChevron };

/** Inset hairline between the number input and the country select (does not touch the box edges). */
export function AuthFieldDivider() {
  return <span aria-hidden="true" className="my-3.5 w-px shrink-0 self-stretch bg-[hsl(40_12%_78%)]" />;
}

/**
 * The short gold rule that precedes every primary action — a signature stroke at the inline start,
 * not a full-width border (the brief: fewer lines, more intent).
 */
export function AuthDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex", className)}>
      <span aria-hidden="true" className="h-px w-12 bg-[hsl(42_78%_55%)]" />
    </div>
  );
}

export type AuthSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

/** Lapis primary button — plain, substantial, label only (the Ankh stays reserved for the slogan). */
export const AuthSubmitButton = forwardRef<HTMLButtonElement, AuthSubmitButtonProps>(
  function AuthSubmitButton({ className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="submit"
        {...props}
        className={cn(
          "flex h-[60px] w-full items-center justify-center rounded-none bg-[hsl(228_40%_14%)] px-5 font-plex-arabic text-[16.5px] font-semibold text-papyrus transition-[background-color,transform] duration-200 hover:bg-[hsl(228_36%_20%)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0",
          authFocusRingClass,
          className
        )}
      >
        {children}
      </button>
    );
  }
);

/** Same outline treatment for a `<Link>` used as a secondary action. */
export const authOutlineActionClass = cn(
  "flex h-[60px] w-full items-center justify-center rounded-none border border-[hsl(228_40%_14%)] bg-transparent px-5 font-plex-arabic text-[16px] font-semibold text-[hsl(228_40%_14%)] transition-colors duration-200 hover:bg-[hsl(228_40%_14%)]/5",
  authFocusRingClass
);

/** Secondary action as a button (outline, no mark). */
export const AuthOutlineButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function AuthOutlineButton({ className, children, ...props }, ref) {
    return (
      <button ref={ref} {...props} className={cn(authOutlineActionClass, className)}>
        {children}
      </button>
    );
  }
);

/**
 * "Not registered? Create an account" style line: quiet lead-in, the action itself in ink with a
 * gold underline — the interactive part is the emphasised part.
 */
export const authInlineActionClass =
  "font-plex-arabic font-medium text-[hsl(228_40%_14%)] underline decoration-gold-500 decoration-1 underline-offset-[5px] transition-colors hover:text-gold-600";

const eyeIconProps = {
  viewBox: "0 0 21 21",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
} as const;

export interface PasswordFieldBoxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/**
 * A field box containing a password input plus an eye / eye-off visibility toggle (icon only, one
 * 1.3 stroke like the navbar icons). The toggle's accessible name deliberately avoids repeating
 * "كلمة المرور" / "تأكيد كلمة المرور" (whatever the field's own label says) as a literal substring —
 * Playwright (and other accessible-name tooling) resolves `getByLabel(...)` against ANY element
 * whose aria-label contains the search text, so a toggle labelled e.g. "إظهار كلمة المرور" next to
 * a field labelled "كلمة المرور" collides with that field's own label lookup.
 */
export const PasswordFieldBox = forwardRef<HTMLInputElement, PasswordFieldBoxProps>(
  function PasswordFieldBox({ className, error, ...props }, ref) {
    const [show, setShow] = useState(false);
    return (
      <div className={cn(authFieldBoxClass(error), "items-center")}>
        <input
          ref={ref}
          type={show ? "text" : "password"}
          dir="ltr"
          {...props}
          className={cn(authBareInputClass, !show && "tracking-[0.28em]", className)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className={cn(
            "grid h-full w-12 shrink-0 place-items-center text-[hsl(228_20%_40%)] transition-colors hover:text-[hsl(228_40%_14%)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500"
          )}
          aria-label={show ? "إخفاء قيمة الحقل المُدخلة" : "إظهار قيمة الحقل المُدخلة"}
        >
          {show ? (
            <svg {...eyeIconProps} className="block h-[21px] w-[21px]">
              <path d="M3 10.5s2.8-4.6 7.5-4.6 7.5 4.6 7.5 4.6-2.8 4.6-7.5 4.6S3 10.5 3 10.5z" />
              <circle cx="10.5" cy="10.5" r="2.3" />
              <path d="M4.2 16.8L16.8 4.2" />
            </svg>
          ) : (
            <svg {...eyeIconProps} className="block h-[21px] w-[21px]">
              <path d="M3 10.5s2.8-4.6 7.5-4.6 7.5 4.6 7.5 4.6-2.8 4.6-7.5 4.6S3 10.5 3 10.5z" />
              <circle cx="10.5" cy="10.5" r="2.3" />
            </svg>
          )}
        </button>
      </div>
    );
  }
);
