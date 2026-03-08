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
      { labelAr: "تي شيرت", href: "/search?q=تي+شيرت" },
      { labelAr: "بيجامات", href: "/search?q=بيجامات" },
      { labelAr: "ملابس منزلية", href: "/search?q=ملابس+منزلية" },
      { labelAr: "أطقم", href: "/search?q=أطقم" },
      { labelAr: "جديد", href: "/categories/men?sort=newest" },
      { labelAr: "الأكثر مبيعًا", href: "/categories/men?sort=popular" },
    ],
  },
  {
    id: "women",
    labelAr: "السيدات",
    slug: "women",
    children: [
      { labelAr: "الكل", href: "/categories/women" },
      { labelAr: "بيجامات", href: "/search?q=بيجامات" },
      { labelAr: "ملابس منزلية", href: "/search?q=ملابس+منزلية" },
      { labelAr: "أطقم", href: "/search?q=أطقم" },
      { labelAr: "جديد", href: "/categories/women?sort=newest" },
      { labelAr: "الأكثر مبيعًا", href: "/categories/women?sort=popular" },
    ],
  },
  {
    id: "kids",
    labelAr: "الأطفال",
    slug: "kids",
    children: [
      { labelAr: "الكل", href: "/categories/kids" },
      { labelAr: "أولاد", href: "/search?q=أولاد" },
      { labelAr: "بنات", href: "/search?q=بنات" },
      { labelAr: "بيجامات", href: "/search?q=بيجامات" },
      { labelAr: "أطقم", href: "/search?q=أطقم" },
      { labelAr: "جديد", href: "/categories/kids?sort=newest" },
      { labelAr: "الأكثر مبيعًا", href: "/categories/kids?sort=popular" },
    ],
  },
];
