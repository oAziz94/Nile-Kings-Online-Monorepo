/**
 * Menu drawer structure: main category sections with optional subcategory links.
 * Wire "slug" to real categories from GET /api/categories when available.
 */

export type MenuSectionItem = {
  labelAr: string;
  /** Optional section slug for URL (e.g. "اطقم"). When set, category page shows one card per color variant. */
  sectionSlug?: string;
  href: string;
};

export type MenuSection = {
  id: string;
  labelAr: string;
  slug: string;
  children: MenuSectionItem[];
};

/** Fallback menu sections. Replace or merge with API categories (id/slug) when needed. */
export const MENU_SECTIONS: MenuSection[] = [
  {
    id: "men",
    labelAr: "الرجال",
    slug: "men",
    children: [
      { labelAr: "الكل", href: "/categories/men" },
      { labelAr: "تي شيرت", sectionSlug: "تي شيرت", href: "/categories/men?section=تي%20شيرت" },
      { labelAr: "بيجامات", sectionSlug: "بيجامات", href: "/categories/men?section=بيجامات" },
      { labelAr: "اطقم", sectionSlug: "اطقم", href: "/categories/men?section=اطقم" },
      { labelAr: "ملابس داخلية", sectionSlug: "ملابس داخلية", href: "/categories/men?section=ملابس%20داخلية" },
    ],
  },
  {
    id: "women",
    labelAr: "السيدات",
    slug: "women",
    children: [
      { labelAr: "الكل", href: "/categories/women" },
      { labelAr: "تي شيرت", sectionSlug: "تي شيرت", href: "/categories/women?section=تي%20شيرت" },
      { labelAr: "بيجامات", sectionSlug: "بيجامات", href: "/categories/women?section=بيجامات" },
      { labelAr: "اطقم", sectionSlug: "اطقم", href: "/categories/women?section=اطقم" },
      { labelAr: "ملابس داخلية", sectionSlug: "ملابس داخلية", href: "/categories/women?section=ملابس%20داخلية" },
    ],
  },
  {
    id: "kids",
    labelAr: "الأطفال",
    slug: "kids",
    children: [
      { labelAr: "الكل", href: "/categories/kids" },
      { labelAr: "تي شيرت", sectionSlug: "تي شيرت", href: "/categories/kids?section=تي%20شيرت" },
      { labelAr: "بيجامات", sectionSlug: "بيجامات", href: "/categories/kids?section=بيجامات" },
      { labelAr: "اطقم", sectionSlug: "اطقم", href: "/categories/kids?section=اطقم" },
      { labelAr: "ملابس داخلية", sectionSlug: "ملابس داخلية", href: "/categories/kids?section=ملابس%20داخلية" },
    ],
  },
];
