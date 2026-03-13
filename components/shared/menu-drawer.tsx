"use client";

import * as React from "react";
import Link from "next/link";
import { X, ChevronDown, ChevronUp, Facebook, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MENU_SECTIONS, type MenuSection } from "@/lib/menu-config";
import { cn } from "@/lib/utils";

async function fetchMenuSections(): Promise<MenuSection[]> {
  const res = await fetch("/api/menu", { cache: "no-store" });
  const json = await res.json();
  if (json?.success && Array.isArray(json?.data?.sections)) return json.data.sections;
  return MENU_SECTIONS;
}

type MenuDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

function MenuAccordionSection({
  section,
  isExpanded,
  onToggle,
  onClose,
}: {
  section: MenuSection;
  isExpanded: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const id = `menu-accordion-${section.id}`;
  return (
    <div className="border-b border-border/80 last:border-b-0">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={id}
        id={`${id}-trigger`}
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between gap-3 py-5 text-right text-base font-semibold text-foreground",
          "hover:text-foreground/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
        )}
      >
        <span>{section.labelAr}</span>
        <span className="shrink-0 text-muted-foreground" aria-hidden>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5" strokeWidth={1.5} />
          ) : (
            <ChevronDown className="h-5 w-5" strokeWidth={1.5} />
          )}
        </span>
      </button>
      <div
        id={id}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={cn(
          "overflow-hidden transition-[grid-template-rows] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
        style={{ display: "grid" }}
      >
        <div className="min-h-0">
          <ul className="pb-3 pr-6 flex flex-col gap-1">
            {section.children.map((item) => (
              <li key={item.href + item.labelAr}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="text-base text-muted-foreground hover:text-foreground transition-colors py-2 block"
                >
                  {item.labelAr}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function MenuDrawer({ isOpen, onClose }: MenuDrawerProps) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [sections, setSections] = React.useState<MenuSection[]>(MENU_SECTIONS);

  const toggleSection = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchMenuSections().then((data) => {
      if (!cancelled) setSections(data);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) setExpandedId(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[110] bg-black/40 transition-opacity duration-300"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="القائمة"
        className={cn(
          "fixed top-0 bottom-0 z-[110] w-[85vw] max-w-[420px] flex flex-col",
          "bg-white border-l border-border/80 shadow-[0_0_40px_rgba(0,0,0,0.08)]",
          "right-0 left-auto",
          "animate-in slide-in-from-right duration-300 ease-out"
        )}
        dir="rtl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/80 px-5 py-4">
          <h2 className="text-xl font-semibold text-foreground">القائمة</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="h-11 w-11 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-6 w-6" strokeWidth={1.5} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4">
            <nav aria-label="تصنيفات المتجر">
              {sections.map((section) => (
                <MenuAccordionSection
                  key={section.id}
                  section={section}
                  isExpanded={expandedId === section.id}
                  onToggle={() => toggleSection(section.id)}
                  onClose={onClose}
                />
              ))}
            </nav>

            <div className="mt-6 pt-4 border-t border-border/80 space-y-2">
              <a
                href={process.env.NEXT_PUBLIC_FACEBOOK_URL ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors py-2"
                aria-label="تابعنا على فيسبوك"
              >
                <Facebook className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                تابعنا على فيسبوك
              </a>
              <a
                href={
                  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
                    ? `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "")}`
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors py-2"
                aria-label="تواصل معنا على واتساب"
              >
                <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                تواصل معنا على واتساب
              </a>
              <a
                href={
                  process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE
                    ? `tel:${(process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_PHONE ?? "").replace(/\D/g, "")}`
                    : "#"
                }
                onClick={onClose}
                className="flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors py-2"
                aria-label="خدمة عملاء - اتصل بنا"
              >
                <Phone className="h-5 w-5 shrink-0" strokeWidth={1.5} />
                خدمة عملاء
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
