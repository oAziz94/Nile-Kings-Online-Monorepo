import Link from "next/link";
import { cn } from "@/lib/utils";

interface ViewAllButtonProps {
  href: string;
  label?: string;
  className?: string;
}

/**
 * "عرض الكل" — backlog 4.6 shared primitive: a text link with a gold underline (per the canvas's
 * section-heading pattern), not a bordered button, kept as a centered block below the section
 * for the existing call sites that render it that way (their layout, not this component's, per
 * screen-body task 4.7+; only the visual language changes here).
 */
export function ViewAllButton({ href, label = "عرض الكل", className }: ViewAllButtonProps) {
  return (
    <div className={cn("mt-10 flex justify-center", className)}>
      <Link
        href={href}
        dir="rtl"
        className="border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
      >
        {label}
      </Link>
    </div>
  );
}
