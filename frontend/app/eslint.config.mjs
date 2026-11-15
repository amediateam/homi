import { createRequire } from "node:module";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// ESLint's own default parser, resolved next to the installed eslint (not a dependency of its own): eslint-config-next
// parses every .js file with typescript-eslint, which does not enforce `ecmaVersion`.
const espree = createRequire(import.meta.resolve("eslint"))("espree");

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // @homi/testing is dev only (WP-03): test files and the development emulator (dev/, WP-21) may import it,
    // product code may not.
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "e2e/**", "dev/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@homi/testing", "@homi/testing/*"],
              message: "@homi/testing is dev only: import it from test files (*.test.ts[x], e2e/**) alone.",
            },
          ],
        },
      ],
    },
  },
  {
    // The boot scripts are inlined as written and must parse on engines below the Next.js floor (WP-21).
    files: ["boot/boot.js", "boot/stubs.js"],
    languageOptions: { parser: espree, ecmaVersion: 5, sourceType: "script", parserOptions: {} },
    // ES5 has no optional catch binding, so `catch (e)` stays even when `e` is unused.
    rules: { "@typescript-eslint/no-unused-vars": ["warn", { caughtErrors: "none" }] },
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
