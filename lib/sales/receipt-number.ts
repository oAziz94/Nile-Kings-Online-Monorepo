/**
 * Per-outlet receipt numbering (backlog 11.3): max existing number + 1, starting at 1.
 * Callers hold a `SELECT ... FOR UPDATE` on the Partner row, so two sales never read the same max.
 */
export function nextReceiptNo(currentMax: number | null | undefined): number {
  return (currentMax ?? 0) + 1;
}
