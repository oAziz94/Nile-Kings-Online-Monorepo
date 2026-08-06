import Link from "next/link";
import { CalendarDays, FileText, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type LegalSection = {
  title: string;
  body: React.ReactNode;
};

export function LegalPage({
  title,
  description,
  updatedAt,
  sections,
  kind,
}: {
  title: string;
  description: string;
  updatedAt: string;
  sections: LegalSection[];
  kind: "terms" | "privacy";
}) {
  const Icon = kind === "privacy" ? ShieldCheck : FileText;

  return (
    <div className="bg-background" dir="rtl">
      <section className="border-b border-border bg-card">
        <div className="container px-4 py-10 md:py-14">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted text-burgundy shadow-sm">
              <Icon className="h-7 w-7" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Nile Kings Legal
            </p>
            <h1 className="mt-3 text-3xl font-bold text-foreground md:text-4xl">
              {title}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
              {description}
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4 text-burgundy" />
              آخر تحديث: {updatedAt}
            </div>
          </div>
        </div>
      </section>

      <div className="container px-4 py-8 md:py-12">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className="lg:sticky lg:top-32 lg:self-start">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-foreground">المحتويات</p>
              <nav className="space-y-1">
                {sections.map((section, index) => (
                  <Link
                    key={section.title}
                    href={`#section-${index + 1}`}
                    className="block rounded-xl px-3 py-2 text-sm leading-6 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {section.title}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="divide-y divide-border">
              {sections.map((section, index) => (
                <section
                  key={section.title}
                  id={`section-${index + 1}`}
                  className={cn("scroll-mt-32 px-5 py-6 md:px-8 md:py-8")}
                >
                  <div className="mb-4 flex items-start gap-3">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-burgundy/10 text-sm font-bold text-burgundy">
                      {index + 1}
                    </span>
                    <h2 className="text-xl font-bold leading-8 text-foreground">
                      {section.title}
                    </h2>
                  </div>
                  <div className="legal-content text-sm leading-8 text-foreground/85 md:text-base">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
