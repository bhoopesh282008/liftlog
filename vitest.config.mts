import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

// Same swap as next.config.ts: the local INDB rows, when this machine has them.
const indbLocal = src("lib/data/indb-foods.local.ts");

export default defineConfig({
  resolve: {
    alias: [
      ...(existsSync(indbLocal) ? [{ find: /^@\/lib\/data\/indb-foods$/, replacement: indbLocal }] : []),
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
