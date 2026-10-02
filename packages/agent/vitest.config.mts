import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));
const apiRoot = fileURLToPath(new URL("../../../api", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@gasboost/tool": `${root}/packages/tool/src/index.ts`,
      "@gasboost/gemini": `${apiRoot}/packages/gemini/src/index.ts`,
      "@gasboost/openai": `${apiRoot}/packages/openai/src/index.ts`,
    },
  },
});
