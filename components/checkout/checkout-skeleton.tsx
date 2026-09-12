import { Skeleton } from "@/components/shared/skeleton";

export function CheckoutSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل الدفع" className="mt-8 grid gap-10 lg:grid-cols-[7fr_4fr] lg:gap-16">
      <div className="space-y-8">
        <div className="space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
