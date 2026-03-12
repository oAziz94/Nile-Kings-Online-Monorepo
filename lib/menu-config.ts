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

/** Fallback menu sections when GET /api/menu is unavailable. Order: كولكشن رجالي - كولكشن حريمي - كولكشن اطفال; inside each: الكل - الاكثر مبيعا (tags loaded from API). */
export const MENU_SECTIONS: MenuSection[] = [
  {
    id: "men",
    labelAr: "كولكشن رجالي",
    slug: "men",
    children: [
      { labelAr: "الكل", href: "/categories/men" },
      { labelAr: "الاكثر مبيعا", href: "/categories/men?sort=best_sales" },
    ],
  },
  {
    id: "women",
    labelAr: "كولكشن حريمي",
    slug: "women",
    children: [
      { labelAr: "الكل", href: "/categories/women" },
      { labelAr: "الاكثر مبيعا", href: "/categories/women?sort=best_sales" },
    ],
  },
  {
    id: "kids",
    labelAr: "كولكشن اطفال",
    slug: "kids",
    children: [
      { labelAr: "الكل", href: "/categories/kids" },
      { labelAr: "الاكثر مبيعا", href: "/categories/kids?sort=best_sales" },
    ],
  },
];
