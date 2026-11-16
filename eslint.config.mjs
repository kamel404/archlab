import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The engine is pure TypeScript: no React, Next, store, UI, content or browser globals.
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "next", "next/*", "zustand", "zustand/*"], message: "src/engine must not depend on UI frameworks." },
            { group: ["@/*", "!@/engine", "!@/engine/*"], message: "src/engine may only import from itself." },
            { group: ["../../*", "!../../engine/*"], message: "src/engine may only import from itself." },
          ],
        },
      ],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage", "navigator", "fetch"],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
