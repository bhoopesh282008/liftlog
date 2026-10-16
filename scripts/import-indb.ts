// Converts the Indian Nutrient Databank (INDB) recipe tables into LiftLog
// foods, written to src/lib/data/indb-foods.ts.
//
//   node scripts/import-indb.ts <folder with INDB.xlsx, recipes_servingsize.xlsx, recipes_names.xlsx>
//   node scripts/import-indb.ts <folder> --inspect   (print each sheet's header row and first rows)
//
// Source: https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
// (Vijayakumar et al., Curr Dev Nutr 2024, doi:10.1016/j.cdnut.2024.103790).
// The repo has no license file, so the generated foods are for personal use;
// INDB_ENABLED in src/lib/data/food-sources.ts turns them off.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

// ---- Minimal .xlsx reader (zip + SpreadsheetML), so no dependency is needed.

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

const textOf = (xml: string) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

type Cell = string | number | null;

// Returns the first worksheet as rows of cells.
function readSheet(path: string): Cell[][] {
  const files = unzip(readFileSync(path));
  const xml = (name: string) => files.get(name)?.toString("utf8") ?? "";
  const shared = [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const firstSheetRel = /<sheet\b[^>]*r:id="([^"]+)"/.exec(xml("xl/workbook.xml"))?.[1];
  const rels = xml("xl/_rels/workbook.xml.rels");
  const target = new RegExp(`<Relationship\\b[^>]*Id="${firstSheetRel}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
    ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheetRel}"`).exec(rels)?.[1]
    ?? "worksheets/sheet1.xml";
  const sheet = xml(target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  const rows: Cell[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Cell[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const body = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val: Cell = null;
      if (type === "s" && v !== undefined) val = shared[Number(v)];
      else if (type === "inlineStr") val = textOf(body);
      else if (type === "str" && v !== undefined) val = decode(v);
      else if (v !== undefined) val = Number.isFinite(Number(v)) ? Number(v) : decode(v);
      cells[ref ? colIndex(ref) : cells.length] = val;
    }
    rows.push(Array.from(cells, (x) => (x === undefined ? null : x)));
  }
  return rows;
}

// Rows as objects keyed by the header row.
export function readTable(path: string): Record<string, Cell>[] {
  const [header, ...rows] = readSheet(path);
  const keys = header.map((h) => String(h ?? "").trim());
  return rows
    .filter((r) => r.some((c) => c !== null && c !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null])));
}

// ---- INDB recipe -> LiftLog food

// INDB recipes that are the same dish as a hand-curated food. The INDB row
// replaces the curated one when INDB is the active source, keeping the
// curated display name and search aliases. Only add a pair when the dish
// really matches (for example, whole masoor is not split red masoor dal).
const REPLACES: Record<string, string> = {
  ASC096: "roti",
  ASC097: "paratha",
  ASC098: "aloo-paratha",
  ASC105: "paneer-paratha",
  ASC142: "naan",
  ASC113: "rice",
  ASC122: "mutton-biryani",
  ASC123: "veg-biryani",
  ASC124: "lemon-rice",
  ASC126: "curd-rice",
  BFP144: "khichdi",
  BFP044: "poha",
  BFP039: "upma",
  ASC151: "moong-dal",
  OSR139: "dal-makhani",
  ASC162: "chole",
  ASC165: "rajma",
  ASC167: "sambar",
  ASC222: "paneer-butter-masala",
  ASC215: "palak-paneer",
  ASC226: "kadai-paneer",
  ASC191: "matar-paneer",
  ASC381: "paneer-tikka",
  ASC171: "aloo-gobi",
  BFP269: "bhindi",
  ASC056: "egg-boiled",
  ASC061: "omelette",
  ASC059: "egg-bhurji",
  BFP240: "egg-curry",
  ASC240: "chicken-curry",
  ASC242: "butter-chicken",
  ASC246: "fish-curry",
  ASC144: "idli",
  BFP148: "dosa",
  ASC146: "masala-dosa",
  ASC147: "rava-dosa",
  BFP152: "uttapam",
  OSR103: "pesarattu",
  ASC474: "dhokla",
  OSR112: "pav-bhaji",
  ASC273: "raita",
  ASC021: "lassi",
  ASC001: "chai",
  ASC282: "kheer",
  ASC343: "besan-ladoo",
  ASC293: "suji-halwa",
  ASC149: "paneer-roll",
};

// Display names for curated foods that INDB replaces. Kept here so the
// generated file does not depend on the curated list's wording changing.
const CURATED_NAMES: Record<string, string> = {
  roti: "Roti", paratha: "Plain paratha", "aloo-paratha": "Aloo paratha", "paneer-paratha": "Paneer paratha",
  naan: "Naan", rice: "Cooked white rice", "mutton-biryani": "Mutton biryani", "veg-biryani": "Veg biryani",
  "lemon-rice": "Lemon rice", "curd-rice": "Curd rice", khichdi: "Khichdi", poha: "Poha", upma: "Upma",
  "moong-dal": "Moong dal", "dal-makhani": "Dal makhani", chole: "Chole (chana masala)", rajma: "Rajma",
  sambar: "Sambar", "paneer-butter-masala": "Paneer butter masala", "palak-paneer": "Palak paneer",
  "kadai-paneer": "Kadai paneer", "matar-paneer": "Matar paneer", "paneer-tikka": "Paneer tikka",
  "aloo-gobi": "Aloo gobi", bhindi: "Bhindi masala", "egg-boiled": "Boiled egg", omelette: "Omelette",
  "egg-bhurji": "Egg bhurji", "egg-curry": "Egg curry", "chicken-curry": "Chicken curry",
  "butter-chicken": "Butter chicken", "fish-curry": "Fish curry", idli: "Idli", dosa: "Plain dosa",
  "masala-dosa": "Masala dosa", "rava-dosa": "Rava dosa", uttapam: "Uttapam", pesarattu: "Pesarattu",
  dhokla: "Dhokla", "pav-bhaji": "Pav bhaji", raita: "Cucumber raita", lassi: "Sweet lassi",
  chai: "Chai with milk and sugar", kheer: "Rice kheer", "besan-ladoo": "Besan ladoo",
  "suji-halwa": "Suji halwa", "paneer-roll": "Paneer kathi roll",
};

// INDB serving units, renamed to what people say. Bowls stay "bowl": INDB's
// bowl is the cookbook's serving (often 250-350 g of dal), not a 150 g katori.
const UNIT_NAMES: Record<string, string> = {
  parantha: "paratha",
  poori: "puri",
  chapati: "roti",
  "kaathi roll": "roll",
  kabab: "kebab",
  "": "serving",
};

export interface IndbRow {
  code: string;
  name: string;
  serving: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  replaces?: string;
  indbName?: string;
}

export interface Rejected {
  code: string;
  name: string;
  reason: string;
}

const num = (v: Cell) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r1 = (n: number) => Math.round(n * 10) / 10;

// Some INDB recipes count the whole deep-frying medium as eaten (samosas,
// pakoras and kofta curries list 250-500 g of fat per serving), a few list a
// whole dish as one serving, and a few have macros that don't add up to the
// listed energy. Those rows are dropped rather than shown with wrong numbers.
export function convert(table: Record<string, Cell>[]): { foods: IndbRow[]; rejected: Rejected[] } {
  const foods: IndbRow[] = [];
  const rejected: Rejected[] = [];
  for (const r of table) {
    const code = String(r.food_code ?? "").trim();
    const name = String(r.food_name ?? "").replace(/\s+/g, " ").trim();
    const kcal = num(r.unit_serving_energy_kcal);
    const protein = num(r.unit_serving_protein_g);
    const carbs = num(r.unit_serving_carb_g);
    const fat = num(r.unit_serving_fat_g);
    const fat100 = num(r.fat_g);
    const reject = (reason: string) => rejected.push({ code, name, reason });
    if (!code || !name) continue;
    if (kcal === null || protein === null || carbs === null || fat === null || kcal <= 0) {
      reject("no per-serving values (an ingredient mix, not a dish)");
      continue;
    }
    if ((fat100 !== null && fat100 > 40) || fat > 60) {
      reject(`fat too high to be real, likely frying oil counted as eaten (${Math.round(fat)} g per serving, ${Math.round(fat100 ?? 0)} g per 100 g)`);
      continue;
    }
    if (kcal > 1200) {
      reject(`serving is a whole dish (${Math.round(kcal)} kcal)`);
      continue;
    }
    const atwater = 4 * protein + 4 * carbs + 9 * fat;
    if (Math.abs(atwater - kcal) > Math.max(25, kcal * 0.35)) {
      reject(`macros (${Math.round(atwater)} kcal) disagree with listed energy (${Math.round(kcal)} kcal)`);
      continue;
    }
    const unitRaw = String(r.servings_unit ?? "").trim().toLowerCase();
    const unit = UNIT_NAMES[unitRaw] ?? unitRaw;
    // INDB's serving weight is the raw ingredients' weight (water included)
    // split per serving, so it's only roughly the cooked portion. Still worth
    // showing: an INDB bowl of dal is ~280 g, about two katoris.
    const kcal100 = num(r.energy_kcal);
    const grams = kcal100 ? (kcal / kcal100) * 100 : null;
    const weight = grams && grams >= 10 && grams <= 1000 ? ` (≈${Math.max(5, Math.round(grams / 5) * 5)} g)` : "";
    const replaces = REPLACES[code];
    foods.push({
      code,
      name: replaces ? CURATED_NAMES[replaces] : name,
      serving: `1 ${unit}${weight}`,
      kcal: Math.round(kcal),
      protein: r1(protein),
      carbs: r1(carbs),
      fat: r1(fat),
      ...(replaces ? { replaces, indbName: name } : {}),
    });
  }
  return { foods, rejected };
}

function render(foods: IndbRow[], rejectedCount: number): string {
  const rows = foods.map((f) =>
    JSON.stringify([f.code, f.name, f.serving, f.kcal, f.protein, f.carbs, f.fat, f.indbName ?? "", f.replaces ?? ""]),
  );
  return `// Generated by scripts/import-indb.ts from the Indian Nutrient Databank
// (INDB, Vijayakumar et al., Curr Dev Nutr 2024; doi:10.1016/j.cdnut.2024.103790,
// https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-). Do not edit by hand.
//
// Values are per INDB recipe serving. ${foods.length} recipes kept, ${rejectedCount} dropped by the
// importer's sanity checks. The source repo has no license file: personal use only
// until the authors grant reuse terms. Turn INDB off in food-sources.ts.
//
// [INDB code, display name, serving, kcal, protein, carbs, fat, INDB name when renamed, curated id it replaces]
export type IndbRow = [string, string, string, number, number, number, number, string, string];

export const INDB_ROWS: IndbRow[] = [
${rows.map((r) => `  ${r},`).join("\n")}
];
`;
}

// ---- Entry point

const [dir, flag] = import.meta.main ? process.argv.slice(2) : [];
if (import.meta.main && !dir) {
  console.error("Usage: node scripts/import-indb.ts <folder with the INDB .xlsx files> [--inspect]");
  process.exit(1);
}

if (dir && flag === "--inspect") {
  for (const f of ["INDB.xlsx", "recipes_servingsize.xlsx", "recipes_names.xlsx"]) {
    const rows = readSheet(join(dir, f));
    console.log(`\n== ${f}: ${rows.length - 1} rows`);
    for (const r of rows.slice(0, 4)) console.log(JSON.stringify(r));
  }
  process.exit(0);
}

if (dir) {
  const { foods, rejected } = convert(readTable(join(dir, "INDB.xlsx")));
  const missing = Object.keys(REPLACES).filter((c) => !foods.some((f) => f.code === c));
  if (missing.length) {
    console.error(`These mapped INDB codes were not kept: ${missing.join(", ")}`);
    process.exit(1);
  }
  const out = join(import.meta.dirname, "..", "src", "lib", "data", "indb-foods.ts");
  writeFileSync(out, render(foods, rejected.length));
  console.log(`Wrote ${foods.length} INDB foods to ${out}`);
  console.log(`Dropped ${rejected.length}:`);
  for (const r of rejected) console.log(`  ${r.code}  ${r.name}: ${r.reason}`);
}
