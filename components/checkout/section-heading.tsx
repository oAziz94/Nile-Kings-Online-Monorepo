/**
 * Numbered flow-section heading (backlog 4.12): Archivo numeral + Amiri heading, matching the
 * "NN  الاسم" pattern the legal-page task will also use — same shared visual language, stated
 * once in `03-backlog.md`'s second-storefront-batch preamble.
 */
export function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="font-archivo text-sm font-medium text-[hsl(228_18%_50%)]"
        style={{ direction: "ltr" }}
        aria-hidden="true"
      >
        {number}
      </span>
      <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] md:text-[28px]">{title}</h2>
    </div>
  );
}
