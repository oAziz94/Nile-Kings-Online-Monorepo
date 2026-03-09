/**
 * Menu drawer structure: main category sections with optional subcategory links.
 * Wire "slug" to real categories from GET /api/categories when available.
 */

export type MenuSectionItem = {
  labelAr: string;
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
      { labelAr: "تي شيرت", href: "/categories/men" },
      { labelAr: "بيجامات", href: "/categories/men" },
      { labelAr: "اطقم", href: "/categories/men" },
      { labelAr: "ملابس داخلية", href: "/categories/men" },
    ],
  },
  {
    id: "women",
    labelAr: "السيدات",
    slug: "women",
    children: [
      { labelAr: "الكل", href: "/categories/women" },
      { labelAr: "تي شيرت", href: "/categories/women" },
      { labelAr: "بيجامات", href: "/categories/women" },
      { labelAr: "اطقم", href: "/categories/women" },
      { labelAr: "ملابس داخلية", href: "/categories/women" },
    ],
  },
  {
    id: "kids",
    labelAr: "الأطفال",
    slug: "kids",
    children: [
      { labelAr: "الكل", href: "/categories/kids" },
      { labelAr: "تي شيرت", href: "/categories/kids" },
      { labelAr: "بيجامات", href: "/categories/kids" },
      { labelAr: "اطقم", href: "/categories/kids" },
      { labelAr: "ملابس داخلية", href: "/categories/kids" },
    ],
  },
];
