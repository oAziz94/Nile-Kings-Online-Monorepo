import { cn } from "@/lib/utils";

/**
 * `design-canvas/partner-v2/Main.dc.html`'s `.pill` — 12px/700, a 6px leading dot, five
 * tones (neutral/info/warning/success/danger). Backlog 5.2 اليوم is the first v2 screen to
 * render it; follow-up (b) from the v1 batch ("status pills with the leading dot") is
 * closed for this component going forward as other v2 screens adopt it.
 */
export type StatusPillTone = "neutral" | "info" | "warning" | "success" | "danger";

const TONE_STYLES: Record<StatusPillTone, { bg: string; dot: string }> = {
  neutral: { bg: "bg-stone-100 text-ink-soft", dot: "bg-stone-300" },
  info: { bg: "bg-turquoise-50 text-turquoise-500", dot: "bg-turquoise-500" },
  warning: { bg: "bg-gold-50 text-gold-600", dot: "bg-gold-500" },
  success: { bg: "bg-malachite-bg text-malachite-text", dot: "bg-malachite-text" },
  danger: { bg: "bg-carnelian-50 text-carnelian-600", dot: "bg-carnelian-500" },
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
  "data-testid": dataTestId,
}: {
  tone?: StatusPillTone;
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <span
      data-testid={dataTestId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold leading-[18px]",
        styles.bg,
        className
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", styles.dot)} aria-hidden="true" />
      <span dir="ltr">{children}</span>
    </span>
  );
}
