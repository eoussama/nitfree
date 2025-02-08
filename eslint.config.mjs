import eslint from "@eslint/js";

import tseslint from "typescript-eslint";



export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
      "padding-line-between-statements": ["error", { blankLine: "always", prev: "import", next: "*" }]
    }
  }
);
