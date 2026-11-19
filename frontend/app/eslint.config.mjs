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
    // Text only on the maps (WP-27, LB-APP-020): markers, cards and popups set every server string with textContent
    // on nodes made by createElement; no HTML parser is reachable from these folders. `setHTML` is MapLibre's Popup.
    files: ["features/map/**", "features/listing/spot/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...["innerHTML", "outerHTML", "insertAdjacentHTML", "setHTML"].map((property) => ({
          property,
          message: `LB-APP-020: no ${property} in the map code; set text with textContent on nodes from document.createElement.`,
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML'], Property[key.name='dangerouslySetInnerHTML']",
          message: "LB-APP-020: no dangerouslySetInnerHTML in the map code; render server strings as text.",
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
    // The MapLibre worker that `scripts/copy-maplibre-worker.mjs` copies before `dev` and `build` (git-ignored).
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
