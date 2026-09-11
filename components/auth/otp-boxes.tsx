"use client";

/**
 * Shared 6-box OTP input, used by both register (WhatsApp OTP step) and forgot-password.
 * Extracted so both screens render the exact same 4 visual states the design canvas documents
 * (docs/redesign/design-canvas/Auth Surface v2.dc.html, screen 2i) — previously each screen had
 * its own near-duplicate box markup with only one (happy-path) visual state.
 *
 * Presentation only: all digit-entry/auto-advance/paste-fanout/backspace behavior is still owned
 * by the calling form (passed in as `onChange`/`onKeyDown`) — no business logic lives here. The
 * banner text is always the real message the (untouched) server route already returned, not
 * copy re-invented to match the canvas's sample numbers (the server doesn't return a remaining-
 * attempts count or exact lock minutes as separate fields, only as part of the message string).
 */
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type OtpBoxState = "idle" | "wrong" | "expired" | "locked";

const OTP_LENGTH = 6;

const STATE_BOX_CLASS: Record<OtpBoxState, (filled: boolean) => string> = {
  idle: (filled) =>
    cn(
      "border bg-white text-[hsl(228_40%_14%)]",
      filled ? "border-2 border-[hsl(228_40%_14%)] border-b-[hsl(42_78%_55%)]" : "border-[hsl(40_12%_70%)]"
    ),
  wrong: () => "border border-[hsl(6_58%_42%)] bg-[hsl(6_60%_98%)] text-[hsl(6_58%_36%)]",
  expired: () => "border border-[hsl(40_12%_82%)] bg-[hsl(42_20%_96%)] text-[hsl(228_8%_62%)]",
  locked: () => "border border-[hsl(40_12%_82%)] bg-[hsl(42_20%_96%)] opacity-45",
};

const STATE_BANNER_CLASS: Record<Exclude<OtpBoxState, "idle">, string> = {
  wrong: "border border-[hsl(6_58%_42%)] bg-[hsl(6_60%_98%)] text-[hsl(6_58%_34%)]",
  expired: "border border-[hsl(40_12%_76%)] bg-white text-[hsl(228_20%_30%)]",
  locked: "border border-[hsl(6_58%_42%)] bg-[hsl(6_60%_98%)] text-[hsl(6_58%_34%)]",
};

/**
 * Client-side-only classification of an OTP verify failure into one of the canvas's 4 visual
 * states, from the response's HTTP status + Arabic message already returned by the existing
 * (untouched) `/api/auth/{register,forgot-password}/verify` routes — no server change, no new
 * error codes. `lib/api/response.ts` maps both "locked" and "too_many_attempts" reasons to a 429
 * (TOO_MANY_REQUESTS), so both collapse into the canvas's single "locked" visual state; a 400 with
 * the expiry message maps to "expired"; any other 400 (wrong code / no request) maps to "wrong".
 */
export function classifyOtpVerifyError(status: number, message: string | undefined): OtpBoxState {
  if (status === 429) return "locked";
  if (message?.includes("انتهت صلاحية")) return "expired";
  return "wrong";
}

export interface OtpBoxesProps {
  digits: string[];
  state: OtpBoxState;
  /** Real message from the server's error response — shown as-is in the state banner. */
  message?: string;
  onChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  setInputRef: (index: number, el: HTMLInputElement | null) => void;
}

export const OtpBoxes = forwardRef<HTMLDivElement, OtpBoxesProps>(function OtpBoxes(
  { digits, state, message, onChange, onKeyDown, setInputRef },
  ref
) {
  const boxClassFor = STATE_BOX_CLASS[state];
  const showBanner = state !== "idle" && message;

  return (
    <div ref={ref} className="flex flex-col gap-3">
      <div dir="ltr" className="flex gap-2">
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <input
            key={i}
            ref={(el) => setInputRef(i, el)}
            type="text"
            inputMode="numeric"
            // Deliberately 6, not 1: a paste into any box must deliver its full multi-char value
            // through onChange so the parent's fan-out logic (handleOtpChange in both
            // register-form.tsx/forgot-password-form.tsx) can distribute it across boxes — the
            // browser truncates a paste to maxLength *before* onChange ever fires, so maxLength=1
            // would silently break paste. Single-keystroke entry is bounded by handleOtpChange's
            // own `.slice(-1)`, not by this attribute.
            maxLength={6}
            disabled={state === "locked"}
            value={digits[i] ?? ""}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            // Exact label kept from the pre-4.5 implementation ("رقم N", not "رقم N من رمز
            // التحقق") — tests/e2e/auth-{register,forgot-password}.spec.ts locate these boxes
            // by this exact accessible name; changing it would be an unnecessary parity break.
            aria-label={`رقم ${i + 1}`}
            className={cn(
              // `min-w-0` is load-bearing: a bare `flex-1` lets the native <input>'s intrinsic
              // content width win over the flex-basis:0% shrink, so all 6 boxes render at their
              // UA-default width instead of sharing the row — 4 of 6 end up clipped off-canvas
              // (caught by ui-verifier's manual viewport check, invisible to Playwright's
              // programmatic fill()/keyboard driving).
              "h-[66px] w-0 min-w-0 flex-1 rounded-none text-center font-archivo text-[24px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
              boxClassFor(!!digits[i])
            )}
          />
        ))}
      </div>
      {showBanner && (
        <div
          role="alert"
          className={cn(
            "px-[14px] py-3 font-plex-arabic text-[12.5px] leading-[1.6]",
            STATE_BANNER_CLASS[state as Exclude<OtpBoxState, "idle">]
          )}
        >
          {message}
        </div>
      )}
    </div>
  );
});
