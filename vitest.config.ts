import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" for Next.js's own SWC transform —
  // Vite/Vitest's oxc-based transform pipeline (Vite 8 default) needs its
  // own JSX mode here, independent of that, or .tsx test files fail to parse.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
