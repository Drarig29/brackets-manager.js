module.exports = {
  parser: "@typescript-eslint/parser", // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: "module" // Allows for the use of imports
  },
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:jsdoc/recommended",
  ],
  rules: {
    "curly": ["error", "multi-or-nest"],
    "brace-style": ["error", "1tbs"],

    "jsdoc/require-jsdoc": ["error", { require: { "MethodDefinition": true } }],
    "jsdoc/require-param-type": 0,
    "jsdoc/require-returns": 0,
    "jsdoc/require-returns-type": 0,

    // I use them rarely but they are understandable and commented. They simplify the code.
    "@typescript-eslint/no-non-null-assertion": 0,
    "@typescript-eslint/no-non-null-asserted-optional-chain": 0,

    // Ignore args starting with an underscore.
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
  }
};
