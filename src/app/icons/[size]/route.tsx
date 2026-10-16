import { iconResponse } from "@/lib/icon-art";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  return iconResponse(size === "512" ? 512 : 192, false);
}
