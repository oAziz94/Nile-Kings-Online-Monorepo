"use client";

import { useCallback, useMemo, useState } from "react";
import type { VariantPublic } from "@/lib/catalog";
import { getVariantSizeOptions, isKidsCategory, normalizeSizeName } from "@/lib/size-display";

/**
 * Backlog 4.9 (approved `04-decisions.md` 2026-09-12 decision 7): the PDP and `QuickShopModal`
 * independently re-implemented the exact same size/colour selection + validation logic
 * (`products-pdp.md` Notes flagged the drift risk). This is the single shared implementation —
 * the pure functions below are unit-tested directly (`use-variant-selection.test.ts`); the hook
 * is a thin `useState`/`useMemo` wrapper so both call sites share one behaviour by construction.
 */

/** Validation copy, verbatim from both the legacy PDP and `QuickShopModal` — do not reword. */
export const VARIANT_SELECTION_MESSAGES = {
  selectSize: "يرجى اختيار المقاس",
  selectColor: "يجب اختيار اللون",
  outOfStock: "هذا المقاس غير متوفر حالياً",
  added: "تمت الإضافة إلى السلة",
} as const;

/** Hardcoded Arabic/English colour-name → hex fallback, used only when `colorHex` is null.
 *  Single source now — both the PDP and the modal previously carried an identical copy. */
export function variantColorHex(v: { colorHex?: string | null; colorName?: string | null }): string {
  if (v.colorHex?.trim()) return v.colorHex.trim();
  const name = (v.colorName ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    أسود: "#000000", أبيض: "#ffffff", أحمر: "#b71c1c", أزرق: "#0d47a1",
    أخضر: "#1b5e20", أصفر: "#f9a825", برتقالي: "#e65100", رمادي: "#616161",
    وردي: "#ad1457", بني: "#3e2723", بيج: "#d7ccc8", كحلي: "#0d47a1",
    black: "#000000", white: "#ffffff", red: "#b71c1c", blue: "#0d47a1",
    green: "#1b5e20", yellow: "#f9a825", grey: "#616161", gray: "#616161",
    pink: "#ad1457", brown: "#3e2723", beige: "#d7ccc8", navy: "#0d47a1",
    orange: "#e65100",
  };
  return map[name] ?? "#9e9e9e";
}

export function colorKey(v: { colorName?: string | null; colorHex?: string | null }): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  disabled: boolean;
}

export interface VariantSelectionComputed<V extends VariantPublic> {
  sizeOptions: { id: string; label: string; disabled: boolean }[];
  /** Backlog 10.4 — sizes scoped to the currently selected colour (stock is per-colour, since an
   *  out-of-stock colour can now be selected). Falls back to `sizeOptions` (the union across every
   *  colour) when no colour is selected yet, unchanged from before. */
  sizeOptionsForSelectedColor: { id: string; label: string; disabled: boolean }[];
  colorOptions: ColorOption[];
  /** Colour options that actually apply to the currently selected size (empty until a size is chosen). */
  colorOptionsForSelectedSize: ColorOption[];
  /** The fully resolved variant for the current size+colour selection, or null until resolvable. */
  selectedVariant: V | null;
  /** Best-effort variant to source the displayed image from, even before a size is chosen. */
  displayVariantForImage: V | null;
}

/** Pure — no React. Mirrors the legacy PDP/`QuickShopModal` selection logic exactly. */
export function computeVariantSelection<V extends VariantPublic>(
  variants: V[],
  forKids: boolean,
  selectedSize: string | null,
  selectedColorId: string | null
): VariantSelectionComputed<V> {
  const sizeOptions = getVariantSizeOptions(variants, forKids);

  const variantsForSelectedSize =
    selectedSize === null ? [] : variants.filter((v) => normalizeSizeName(v.name) === selectedSize);

  // Colours from ALL variants so they're always visible (not gated behind picking a size first).
  const allColorMap = new Map<string, { name: string; hex: string }>();
  variants.forEach((v) => {
    const key = colorKey(v);
    if (!allColorMap.has(key)) {
      allColorMap.set(key, {
        name: v.colorName?.trim() || v.colorHex || "—",
        hex: variantColorHex(v),
      });
    }
  });
  const colorOptions: ColorOption[] = Array.from(allColorMap.entries()).map(([id, { name, hex }]) => ({
    id,
    name,
    hex,
    disabled:
      selectedSize === null
        ? !variants.some((v) => colorKey(v) === id && v.inStock)
        : !variantsForSelectedSize.some((v) => colorKey(v) === id && v.inStock),
  }));

  const colorOptionsForSelectedSize =
    selectedSize === null
      ? []
      : colorOptions.filter((opt) => variantsForSelectedSize.some((v) => colorKey(v) === opt.id));

  const selectedVariant: V | null =
    selectedSize === null
      ? null
      : colorOptionsForSelectedSize.length > 1
        ? selectedColorId
          ? variantsForSelectedSize.find((v) => colorKey(v) === selectedColorId) ?? null
          : null
        : variantsForSelectedSize[0] ?? null;

  const displayVariantForImage: V | null =
    selectedVariant ?? (selectedColorId ? variants.find((v) => colorKey(v) === selectedColorId) ?? null : null);

  // Backlog 10.4 — stock is per colour (per-governorate partner stock), so an out-of-stock
  // colour's own sizes must show struck through even when another colour shares the same size
  // label and has stock. Scoped strictly to the selected colour's own variant rows.
  const sizeOptionsForSelectedColor = selectedColorId
    ? getVariantSizeOptions(
        variants.filter((v) => colorKey(v) === selectedColorId),
        forKids
      )
    : sizeOptions;

  return {
    sizeOptions,
    sizeOptionsForSelectedColor,
    colorOptions,
    colorOptionsForSelectedSize,
    selectedVariant,
    displayVariantForImage,
  };
}

export type VariantValidationResult<V> = { ok: true; variant: V } | { ok: false; message: string };

/**
 * Exact validation order, verbatim, from both legacy implementations:
 * (1) no size → "يرجى اختيار المقاس"
 * (2) size chosen, >1 colour available, none chosen → "يجب اختيار اللون"
 * (3) still no resolved variant (data edge case) → "يرجى اختيار المقاس" again
 * (4) resolved variant but out of stock → "هذا المقاس غير متوفر حالياً"
 */
export function validateVariantSelection<V extends VariantPublic>(
  selectedSize: string | null,
  selectedVariant: V | null,
  colorOptionsForSelectedSize: ColorOption[],
  selectedColorId: string | null
): VariantValidationResult<V> {
  if (selectedSize === null) {
    return { ok: false, message: VARIANT_SELECTION_MESSAGES.selectSize };
  }
  if (colorOptionsForSelectedSize.length > 1 && !selectedColorId) {
    return { ok: false, message: VARIANT_SELECTION_MESSAGES.selectColor };
  }
  if (!selectedVariant) {
    return { ok: false, message: VARIANT_SELECTION_MESSAGES.selectSize };
  }
  if (!selectedVariant.inStock) {
    return { ok: false, message: VARIANT_SELECTION_MESSAGES.outOfStock };
  }
  return { ok: true, variant: selectedVariant };
}

export interface UseVariantSelectionOptions {
  categorySlug?: string | null;
  initialVariantId?: string | null;
}

/**
 * Reactive wrapper shared by the PDP and `QuickShopModal`. Selecting a size clears the colour
 * selection unless the previously selected colour still applies to the new size (unchanged
 * behaviour from both legacy implementations).
 */
export function useVariantSelection<V extends VariantPublic>(
  variants: V[],
  options: UseVariantSelectionOptions = {}
) {
  const { categorySlug, initialVariantId } = options;
  const forKids = isKidsCategory(categorySlug);
  const initialVariant = useMemo(
    () => (initialVariantId ? variants.find((v) => v.id === initialVariantId) ?? null : null),
    [initialVariantId, variants]
  );

  const [selectedSize, setSelectedSizeState] = useState<string | null>(
    initialVariant ? normalizeSizeName(initialVariant.name) : null
  );
  const [selectedColorId, setSelectedColorIdState] = useState<string | null>(
    initialVariant ? colorKey(initialVariant) : null
  );

  const setSelectedSize = useCallback(
    (size: string | null) => {
      setSelectedSizeState(size);
      if (size === null) {
        setSelectedColorIdState(null);
        return;
      }
      const colorKeysForSize = new Set(
        variants.filter((v) => normalizeSizeName(v.name) === size).map((v) => colorKey(v))
      );
      setSelectedColorIdState((prev) => (prev && colorKeysForSize.has(prev) ? prev : null));
    },
    [variants]
  );

  const setSelectedColorId = useCallback((id: string | null) => setSelectedColorIdState(id), []);

  const computed = useMemo(
    () => computeVariantSelection(variants, forKids, selectedSize, selectedColorId),
    [variants, forKids, selectedSize, selectedColorId]
  );

  const validate = useCallback(
    (): VariantValidationResult<V> =>
      validateVariantSelection(
        selectedSize,
        computed.selectedVariant,
        computed.colorOptionsForSelectedSize,
        selectedColorId
      ),
    [selectedSize, selectedColorId, computed]
  );

  const reset = useCallback(() => {
    setSelectedSizeState(null);
    setSelectedColorIdState(null);
  }, []);

  return {
    forKids,
    selectedSize,
    selectedColorId,
    setSelectedSize,
    setSelectedColorId,
    reset,
    validate,
    ...computed,
  };
}
