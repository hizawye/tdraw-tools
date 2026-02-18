import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.svelte"],
    languageOptions: {
      parser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: "latest"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint
    },
    rules: {
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
