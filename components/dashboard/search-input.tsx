import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rebuilt to the design-canvas topbar `.search` field proportions — backlog 4.16. Same
 * prop API as before so admin call sites keep compiling and rendering unchanged.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full min-w-[12rem] sm:w-56", className)}>
      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" strokeWidth={1.6} />
      <Input
        placeholder={placeholder ?? "بحث…"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg pr-10"
      />
    </div>
  );
}
