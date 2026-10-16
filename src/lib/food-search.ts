import { builtinFoods, type BuiltinSource } from "./data/food-sources";
import type { Food } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ");

function score(text: string, name: string, tokens: string[]): number {
  if (!tokens.every((t) => text.includes(t))) return 0;
  const n = norm(name);
  let s = 1;
  if (n.startsWith(tokens[0])) s += 3;
  if (n.split(" ").some((w) => w === tokens[0])) s += 2;
  else if (text.split(" ").some((w) => w === tokens[0])) s += 1.5;
  return s - n.length / 200;
}

// Local results: built-in Indian foods plus the user's own and cached foods.
// Everyday dishes and foods the user logs often rank higher.
export function searchLocal(
  query: string,
  userFoods: Food[],
  useCounts: Map<string, number>,
  limit = 25,
  source?: BuiltinSource,
): Food[] {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const scored: { f: Food; s: number }[] = [];
  for (const { food: f, text, common } of builtinFoods(source)) {
    const s = score(norm(text), f.name, tokens);
    if (s) scored.push({ f, s: s + (common ? 1 : 0) + Math.min(useCounts.get(f.id) ?? 0, 10) * 0.5 });
  }
  for (const f of userFoods) {
    if (f.deletedAt) continue;
    const s = score(norm(`${f.name} ${f.brand ?? ""}`), f.name, tokens);
    if (s) scored.push({ f, s: s + 0.5 + Math.min(useCounts.get(f.id) ?? 0, 10) * 0.5 });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.f);
}

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
}

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

// Open Food Facts reports per 100 g. Convert to the label's serving when it
// gives one, otherwise use 100 g.
export function offToFood(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  let kcal100 = num(n["energy-kcal_100g"]);
  if (kcal100 === null) {
    const kj = num(n["energy_100g"]);
    if (kj !== null) kcal100 = kj / 4.184;
  }
  if (!p.code || !p.product_name || kcal100 === null) return null;
  const grams = num(p.serving_quantity);
  const g = grams && grams > 0 && grams < 2000 ? grams : 100;
  const f = g / 100;
  return {
    id: `off:${p.code}`,
    name: p.product_name.trim(),
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim() || null,
    barcode: p.code,
    serving: g === 100 && !grams ? "100 g" : p.serving_size?.trim() || `${g} g`,
    servingGrams: g,
    kcal: Math.round(kcal100 * f),
    protein: r1((num(n["proteins_100g"]) ?? 0) * f),
    carbs: r1((num(n["carbohydrates_100g"]) ?? 0) * f),
    fat: r1((num(n["fat_100g"]) ?? 0) * f),
    source: "off",
    updatedAt: 0,
  };
}

export async function searchOnline(query: string, signal?: AbortSignal): Promise<Food[]> {
  const res = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`Food search failed (${res.status})`);
  return ((await res.json()) as { foods: Food[] }).foods;
}

export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | null> {
  const res = await fetch(`/api/foods/barcode/${encodeURIComponent(code)}`, { signal });
  if (!res.ok) throw new Error(`Barcode lookup failed (${res.status})`);
  return ((await res.json()) as { food: Food | null }).food;
}
