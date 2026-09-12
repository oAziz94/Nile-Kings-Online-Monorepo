import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border border-dashed border-[hsl(228_16%_82%)] bg-[hsl(38_22%_95%)] p-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[hsl(228_16%_82%)] text-[hsl(228_18%_45%)]">
          {icon}
        </div>
      )}
      <h3 className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-[hsl(228_18%_45%)]">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
