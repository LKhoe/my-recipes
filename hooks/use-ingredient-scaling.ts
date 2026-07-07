"use client";

import { useState } from "react";

// Quick multiply-by-factor presets — a direct "double this recipe" control that works whether or
// not the recipe has a known servings count (unlike the +/- servings stepper, which needs one).
export const QUICK_SCALE_FACTORS = [1, 1.5, 2, 3];

/**
 * Unifies two scaling interactions (SPEC §4.3's servings-based scaling, plus the "multiply by a
 * factor" feature) behind one number: `factor`. The servings +/- stepper and the factor
 * quick-select buttons are just two different ways of setting the same underlying multiplier —
 * shared here so `ScalableIngredients` (recipe detail) and `CookModeClient` (Cook Mode) don't
 * each reimplement the conversion between "servings" and "factor".
 */
export function useIngredientScaling(
  originalServings: number | null,
  onChange?: (servings: number | null) => void,
) {
  const [factor, setFactorState] = useState(1);

  // Rounded for display only — ingredient quantities themselves scale by the exact factor.
  const servings = originalServings ? Math.round(originalServings * factor) : null;

  function setFactor(next: number) {
    if (next <= 0) return;
    setFactorState(next);
    onChange?.(originalServings ? Math.round(originalServings * next) : null);
  }

  function adjustServings(delta: number) {
    if (!originalServings) return;
    const nextServings = Math.max(1, (servings ?? originalServings) + delta);
    setFactor(nextServings / originalServings);
  }

  return { factor, servings, setFactor, adjustServings };
}
