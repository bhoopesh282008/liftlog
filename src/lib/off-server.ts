import { offToFood } from "./food-search";
import type { Food } from "./types";

// Open Food Facts asks every client to identify itself, and its endpoints
// don't send CORS headers reliably, so lookups go through our server.
const HEADERS = { "User-Agent": "LiftLog/0.1 (personal gym and nutrition tracker)" };
const FIELDS = "code,product_name,brands,nutriments,serving_size,serving_quantity";

export async function offSearch(q: string): Promise<Food[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as { hits?: Parameters<typeof offToFood>[0][] };
  return (data.hits ?? []).map(offToFood).filter((f): f is Food => f !== null);
}

export async function offBarcode(code: string): Promise<Food | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`barcode ${res.status}`);
  const data = (await res.json()) as { status?: number; product?: Parameters<typeof offToFood>[0] };
  if (data.status !== 1 || !data.product) return null;
  return offToFood({ ...data.product, code: data.product.code ?? code });
}
