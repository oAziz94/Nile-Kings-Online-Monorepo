import { cn } from "@/lib/utils";

/**
 * Backlog 10.16 — every dashboard table cell that names a product carries its
 * identifier (variant SKU, or product slug when there is no variant) on a
 * second, small, muted, LTR monospace line under the name. One shared piece
 * so the look is identical everywhere (admin + partner tables, phone cards).
 */

/** The identifier line alone — for cells that already render the name markup
 * themselves and just need to append the matching SKU/slug line under it. */
export function ProductIdentityLine({
  identifier,
  className,
}: {
  identifier?: string | null;
  className?: string;
}) {
  if (!identifier) return null;
  return (
    <span
      dir="ltr"
      className={cn("mt-0.5 block select-all font-mono text-[11px] text-ink-soft", className)}
    >
      {identifier}
    </span>
  );
}

export function ProductIdentity({
  name,
  identifier,
  className,
  nameClassName,
}: {
  name: React.ReactNode;
  identifier?: string | null;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <span className={cn("block", className)}>
      <span className={cn("block", nameClassName)}>{name}</span>
      <ProductIdentityLine identifier={identifier} />
    </span>
  );
}
