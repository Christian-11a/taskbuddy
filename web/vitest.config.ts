import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Node 25+ ships an experimental native `localStorage` global that
    // shadows jsdom's own implementation, breaking session/client tests
    // that rely on it (see web/src/lib/api/session.test.ts). Disabling it
    // for vitest's worker processes lets jsdom provide a working one.
    poolOptions: {
      forks: {
        execArgv: ["--no-experimental-webstorage"],
      },
    },
  },
});
