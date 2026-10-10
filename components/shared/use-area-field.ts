"use client";

import * as React from "react";
import { getAreasForGovernorate, resolveGovernorateForArea } from "@/lib/data/egypt-areas";

/** Select value for the trailing "أخرى…" option; never stored — the stored `area` is the chosen
 * label or the typed free text. */
export const AREA_OTHER_VALUE = "__other__";
export const AREA_OTHER_LABEL = "أخرى…";
export const AREA_PLACEHOLDER = "اختر المنطقة";

type AreaPatch = { area?: string; governorate?: string };

/**
 * Headless state for the المنطقة dropdown + "أخرى" free-text input (backlog 10.48), shared by the
 * location modal, the checkout address form and the profile address form so the three agree.
 * Each form renders its own markup and applies the patch to its own state.
 *
 * "أخرى" is represented as `isOther` (UI only): the select shows `AREA_OTHER_VALUE` and the text
 * input is shown; the payload `area` is simply the typed text. A stored area not in the
 * governorate's list (older free-text addresses) also renders as أخرى with the text prefilled.
 */
export function useAreaField({
  governorate,
  area,
  onChange,
}: {
  governorate: string;
  area: string;
  onChange: (patch: AreaPatch) => void;
}) {
  const options = getAreasForGovernorate(governorate);
  const [otherMode, setOtherMode] = React.useState(false);
  const isOther = otherMode || (area.trim() !== "" && !options.includes(area));
  const selectValue = isOther ? AREA_OTHER_VALUE : area;

  // Changing governorate invalidates a dropdown pick from the previous governorate's list.
  const prevGovernorate = React.useRef(governorate);
  React.useEffect(() => {
    const prev = prevGovernorate.current;
    prevGovernorate.current = governorate;
    if (prev === governorate) return;
    if (area && getAreasForGovernorate(prev).includes(area) && !getAreasForGovernorate(governorate).includes(area)) {
      setOtherMode(false);
      onChange({ area: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [governorate]);

  function onSelect(value: string) {
    if (value === AREA_OTHER_VALUE) {
      setOtherMode(true);
      if (options.includes(area)) onChange({ area: "" });
      return;
    }
    setOtherMode(false);
    onChange({ area: value });
  }

  function onText(value: string) {
    onChange({ area: value });
  }

  /** Free text naming a known area of another governorate silently corrects the governorate. */
  function onTextBlur() {
    const resolved = resolveGovernorateForArea(area);
    if (resolved && resolved !== governorate) onChange({ governorate: resolved });
  }

  return { options, isOther, selectValue, disabled: !governorate, onSelect, onText, onTextBlur };
}
