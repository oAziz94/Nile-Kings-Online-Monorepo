/** Minimum COD fee in piastres (5 EGP). */
export const COD_FEE_MIN_PIASTRES = 500;

/**
 * COD fee from percent of order before COD, with a 5 EGP floor.
 * Returns 0 when percent is 0 or base is non-positive.
 */
export function computeCodFeePiastres(
  orderBeforeCodPiastres: number,
  codFeePercent: number
): number {
  if (codFeePercent <= 0 || orderBeforeCodPiastres <= 0) return 0;
  const fromPercent = Math.round((orderBeforeCodPiastres * codFeePercent) / 100);
  return Math.max(fromPercent, COD_FEE_MIN_PIASTRES);
}
