import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Legacy aliases — retired names, repointed at the pharaonic palette so
        // not-yet-migrated screens (see app/globals.css) render on-brand. New work
        // should use the palette below (lapis/gold/carnelian/turquoise/malachite) directly.
        burgundy: "hsl(var(--burgundy))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        hover: { DEFAULT: "hsl(var(--hover))", foreground: "hsl(var(--hover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },

        // Materials of the pharaohs — v2 palette (docs/redesign/01-design-system.md)
        papyrus: "hsl(var(--papyrus))",
        ink: "hsl(var(--ink))",
        "ink-soft": "hsl(var(--ink-soft))",
        stone: {
          100: "hsl(var(--stone-100))",
          200: "hsl(var(--stone-200))",
          300: "hsl(var(--stone-300))",
        },
        lapis: {
          900: "hsl(var(--lapis-900))",
          800: "hsl(var(--lapis-800))",
          700: "hsl(var(--lapis-700))",
          600: "hsl(var(--lapis-600))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          50: "hsl(var(--gold-50))",
          100: "hsl(var(--gold-100))",
          500: "hsl(var(--gold-500))",
          600: "hsl(var(--gold-600))",
        },
        carnelian: {
          50: "hsl(var(--carnelian-50))",
          500: "hsl(var(--carnelian-500))",
          600: "hsl(var(--carnelian-600))",
        },
        turquoise: {
          50: "hsl(var(--turquoise-50))",
          500: "hsl(var(--turquoise-500))",
        },
        malachite: {
          bg: "hsl(var(--malachite-bg))",
          text: "hsl(var(--malachite-text))",
        },
        "warn-bg": "hsl(var(--warn-bg))",
        "warn-text": "hsl(var(--warn-text))",
        "danger-bg": "hsl(var(--danger-bg))",
        "danger-text": "hsl(var(--danger-text))",
        "info-bg": "hsl(var(--info-bg))",
        "info-text": "hsl(var(--info-text))",
        "neutral-bg": "hsl(var(--neutral-bg))",
        "neutral-text": "hsl(var(--neutral-text))",
      },
      fontFamily: {
        cairo: ["var(--font-cairo)", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        card: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
      },
      keyframes: {
        "loading-dots": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.5" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "loading-dots": "loading-dots 0.6s ease-in-out infinite both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
