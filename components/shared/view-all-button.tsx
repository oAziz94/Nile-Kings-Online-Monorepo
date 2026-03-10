import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ViewAllButtonProps {
  href: string;
  label?: string;
  className?: string;
}

export function ViewAllButton({ href, label = "عرض الكل", className }: ViewAllButtonProps) {
  return (
    <div className={cn("mt-10 flex justify-center", className)}>
      <Button variant="outline" size="default" className="rounded-2xl" asChild>
        <Link href={href} dir="rtl">
          {label}
        </Link>
      </Button>
    </div>
  );
}
