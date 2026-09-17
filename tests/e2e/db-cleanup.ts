/**
 * Backlog 10.10 — cleanup helpers that refuse an empty filter.
 *
 * Incident (2026-09-17, see docs/redesign/04-decisions.md "The night a test emptied the
 * stock table"): a spec's `afterAll` deleted `PartnerInventory` rows filtered on a fixture
 * variant id, after `beforeAll` had failed on a dropped connection, so that id was never
 * assigned. Prisma reads an undefined scalar as *no filter at all*, so the call matched
 * and deleted every `PartnerInventory` row in the database — 1,985 rows, 5,744 units, with
 * the branch reset from production the only way back.
 *
 * The rule from here on: a cleanup never filters on a bare variable. Ids are deleted by
 * list (`deleteByIds`, which drops undefined/empty entries and no-ops on an empty list
 * rather than deleting), and any other filter is built through `safeWhere`, which throws
 * instead of deleting when a value would be `undefined` or the filter would be empty.
 */

type DeleteManyDelegate<Where> = {
  deleteMany: (args: { where: Where }) => Promise<unknown>;
};

/** Drops `undefined`, `null` and empty-string entries, keeping only real ids. */
export function definedIds(ids: (string | undefined | null)[]): string[] {
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Deletes rows whose `field` (default `"id"`) is in `ids`, after dropping any
 * undefined/null/empty entries. If nothing is left, this is a no-op — it never falls
 * back to an unfiltered (or accidentally unfiltered) `deleteMany`.
 */
export async function deleteByIds<Where extends Record<string, unknown>>(
  delegate: DeleteManyDelegate<Where>,
  ids: (string | undefined | null)[],
  field: string = "id"
): Promise<void> {
  const clean = definedIds(ids);
  if (clean.length === 0) return;
  await delegate.deleteMany({ where: { [field]: { in: clean } } as unknown as Where });
}

/**
 * Guards an arbitrary `where` object against any top-level `undefined` value (Prisma's
 * "no condition" reading of `undefined`) and against being empty — both of which would
 * turn a scoped cleanup into a table-wide one. Throws instead of returning a filter that
 * would delete more than intended; never silently narrows or drops keys.
 */
export function safeWhere<T extends Record<string, unknown>>(where: T): T {
  const keys = Object.keys(where);
  if (keys.length === 0) {
    throw new Error("unsafe cleanup filter: where is empty");
  }
  for (const key of keys) {
    if (where[key] === undefined) {
      throw new Error(`unsafe cleanup filter: ${key} is undefined`);
    }
  }
  return where;
}
