import appConfig from "../app/eslint.config.mjs";

// One rule set, the app's. Importing that file (not copying it) resolves its bare
// specifiers — "eslint/config", "eslint-config-next" — from frontend/app/, the only
// place ESLint is installed. Discovered by walking up from a package, so the base
// path stays frontend/packages/. The lint script must not pass --config: that would
// retarget the base path at the package and the patterns below would miss.
export default [
  ...appConfig,
  {
    // These packages are not Next.js apps.
    // no-img-element flags EmptyState's decorative <img>; @homi/ui cannot use next/image.
    // no-html-link-for-pages looks for pages/ next to the package and warns when it is missing.
    // react.version "detect" warns in every package except @homi/ui, the only one that depends on react.
    // 19.3.1 is the react the app and @homi/ui install (a valid semver; "19" is not).
    settings: {
      react: { version: "19.3.1" },
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
  {
    // openapi-typescript output. A finding here cannot be fixed by editing the file.
    ignores: ["types/src/generated/**"],
  },
  {
    // @homi/testing is the dev-only package itself. Test files are already exempt in the app config.
    files: ["testing/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
