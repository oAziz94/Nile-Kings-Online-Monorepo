import Image from "next/image";

/**
 * Shared shell for every (auth) screen (login, register, forgot-password).
 *
 * Builds the design canvas's desktop two-pane "brand pane" layout
 * (docs/redesign/design-canvas/AuthLogin-Desktop.dc.html) — deliberately not built for 4.1
 * (Login) to avoid restructuring this shared layout three times; built once here, for 4.2
 * (Register), per docs/redesign/03-backlog.md's 4.1/4.2 entries. Brand-pane content
 * (logo/quote/meta) is fixed layout chrome shared by all three screens, not per-screen.
 *
 * Below the `lg` breakpoint this collapses to the same single centered card every (auth)
 * screen already rendered before this layout existed (no brand pane) — a responsive layout,
 * not a separate mobile design.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <div
        className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-16 text-papyrus lg:flex"
        style={{
          // Gold radial accent layered over the lapis base gradient, matching the canvas's
          // `.brand-pane` + `.brand-pane::after` exactly (first-listed layer paints on top).
          background:
            "radial-gradient(50% 60% at 90% 100%, hsl(var(--gold-500) / 0.14), transparent 70%), " +
            "radial-gradient(120% 100% at 20% 0%, hsl(var(--lapis-700)) 0%, hsl(var(--lapis-900)) 65%)",
        }}
      >
        <Image
          src="/brand/logo-gold.png"
          alt="نايل كينجز"
          width={700}
          height={437}
          className="h-9 w-auto"
          priority
        />
        <p className="max-w-[460px] text-[34px] font-extrabold leading-[1.5] tracking-tight">
          قطن مصري <span className="text-gold-500">100%</span>، يوصلك أينما كنت — من القاهرة إلى أسوان.
        </p>
        <p className="text-[13px]" style={{ color: "hsl(43 40% 78%)" }}>
          أكثر من 27 محافظة مغطاة بشبكة شركاء التوصيل
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 lg:p-10">
        {/*
          max-w-md (448px), not the canvas's literal 400px: every (auth) screen's own form
          component (login-form.tsx/register-form.tsx) already wraps its fields in a card with
          p-6 (24px) padding on each side, so 448px here nets out to the canvas's intended
          ~400px *content* width (448 - 48 = 400) once that padding is accounted for. Using a
          plain 400px wrapper on top of that padding would double-subtract and leave the phone
          input + country-code select cramped into ~352px.
        */}
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
