// Placeholder for the Indian Nutrient Databank (INDB) rows, which stay out of
// git: INDB has no licence file, so its data is for personal use only.
//
// To use INDB locally, run scripts/import-indb.ts. It writes the rows to
// indb-foods.local.ts (gitignored), and next.config.ts and vitest.config.mts
// load that file in place of this one when it exists. Without it the app
// searches the curated foods only, exactly like the public build.
//
// [INDB code, display name, serving, kcal, protein, carbs, fat, INDB name when renamed, curated id it replaces]
export type IndbRow = [string, string, string, number, number, number, number, string, string];

export const INDB_ROWS: IndbRow[] = [];
