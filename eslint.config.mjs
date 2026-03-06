import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        chrome: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Blob: "readonly",
        atob: "readonly",
        DocumentFragment: "readonly",
        module: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    files: ["__tests__/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        jest: "readonly",
        module: "readonly",
        require: "readonly",
        global: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/", "coverage/"],
  },
];
