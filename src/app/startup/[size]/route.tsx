import { ImageResponse } from "next/og";
import { STARTUP_SCREENS, startupPixels } from "@/lib/startup-screens";

export function generateStaticParams() {
  return STARTUP_SCREENS.map((s) => ({ size: startupPixels(s) }));
}

// Plain graphite, the splash's exact first frame (its light and barbell
// start invisible), so iOS hands over to the animated splash without a jump.
export async function GET(_req: Request, ctx: RouteContext<"/startup/[size]">) {
  const { size } = await ctx.params;
  if (!STARTUP_SCREENS.some((s) => startupPixels(s) === size)) return new Response("Not found", { status: 404 });
  const [width, height] = size.split("x").map(Number);
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0b0c" }} />, { width, height });
}
