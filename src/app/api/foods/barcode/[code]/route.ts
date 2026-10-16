import { offBarcode } from "@/lib/off-server";

export async function GET(_req: Request, ctx: RouteContext<"/api/foods/barcode/[code]">) {
  const { code } = await ctx.params;
  if (!/^\d{6,14}$/.test(code)) return Response.json({ food: null }, { status: 400 });
  try {
    return Response.json({ food: await offBarcode(code) });
  } catch {
    return Response.json({ error: "Barcode lookup is unavailable right now." }, { status: 502 });
  }
}
