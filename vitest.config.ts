import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/**/*.test.ts"],
          exclude: ["test/e2e.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "e2e",
          include: ["test/e2e.test.ts"],
          // One shared control plane for the whole e2e run, via our own glue.
          globalSetup: ["./test/e2e-global-setup.ts"],
        },
      },
    ],
  },
});
