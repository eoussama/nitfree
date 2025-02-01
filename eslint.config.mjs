//import antfu from "@antfu/eslint-config";



//const baseConfig = antfu();

export default {
  //...baseConfig,
  rules: {
    semi: ["error", "always"],
    quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: true }],
    "padding-line-between-statements": [
      "error",
      { blankLine: "always", prev: "import", next: "*" }
    ]
  }
};
