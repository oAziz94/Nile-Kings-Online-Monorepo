import Link from "next/link";
import { ViewAllButton } from "@/components/shared/view-all-button";
import { cn } from "@/lib/utils";

interface CollectionCarouselSectionProps {
  title: string;
  viewAllHref: string;
  children: React.ReactNode;
  className?: string;
}

export function CollectionCarouselSection({
  title,
  viewAllHref,
  children,
  className,
}: CollectionCarouselSectionProps) {
  return (
    <section
      className={cn("py-10 md:py-12", className)}
      aria-label={title}
    >
      <div className="mb-6 flex items-center justify-center gap-4 px-4">
        <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl" dir="rtl">
          <Link href={viewAllHref} className="transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm">
            {title}
          </Link>
        </h2>
        <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
      </div>
      <div className="w-full px-0">{children}</div>
      <ViewAllButton href={viewAllHref} />
    </section>
  );
}
