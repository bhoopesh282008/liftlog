import type { NextRequest } from "next/server";
import { offSearch } from "@/lib/off-server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) return Response.json({ foods: [] });
  try {
    return Response.json({ foods: await offSearch(q) });
  } catch {
    return Response.json({ error: "Food search is unavailable right now." }, { status: 502 });
  }
}
