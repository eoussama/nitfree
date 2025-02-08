import eslint from "@eslint/js";
import tseslint from "typescript-eslint";



export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: ["extension/"]
  },
  {
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }]
    }
  }
);
