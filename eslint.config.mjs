export default {
  ignores: ["extension/**/*"],
  //files: ["**/*.{ts,cts,mts,js,mjs,cjs}"],
  rules: {
    semi: ["error", "always"],
    quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
    "padding-line-between-statements": [
      "error",
      { blankLine: "always", prev: "import", next: "*" }
    ]
  }
};
