import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AdminPanelCard({
  title,
  description,
  icon,
  toolbar,
  children,
  className,
  contentClassName,
  noPadding,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <Card className={cn("rounded-lg border-border shadow-none", className)}>
      <CardHeader
        className={cn(
          "gap-4 border-b border-border bg-muted/20 px-4 py-3 sm:px-5",
          toolbar ? "flex flex-col sm:flex-row sm:items-center sm:justify-between" : undefined
        )}
      >
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {toolbar}
      </CardHeader>
      <CardContent className={cn(!noPadding && "p-4 sm:p-5", noPadding && "p-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
