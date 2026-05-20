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
    <Card className={cn("rounded-2xl border-border/80 shadow-card", className)}>
      <CardHeader
        className={cn(
          "gap-4 border-b border-border/60 bg-muted/30",
          toolbar ? "flex flex-col sm:flex-row sm:items-center sm:justify-between" : undefined
        )}
      >
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {toolbar}
      </CardHeader>
      <CardContent className={cn(noPadding && "p-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
