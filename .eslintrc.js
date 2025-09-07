module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    overrides: [
        {
            files: ['*.ts'],
            extends: [
                'plugin:@typescript-eslint/recommended-requiring-type-checking',
            ],
            parserOptions: {
                project: './tsconfig.json',
            },
        },
    ],
    ignorePatterns: ['dist/', 'docs/', 'webpack.config.js'],
    extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:jsdoc/recommended',
    ],
    rules: {
        'curly': ['error', 'multi-or-nest'],
        'brace-style': ['error', '1tbs'],
        'quotes': ['error', 'single'],
        'eqeqeq': 'error',
        'default-case': 'error',
        'semi': 'off',
        'eol-last': ['error', 'always'],
        '@typescript-eslint/semi': ['error'],

        'comma-dangle': ['error', {
            'arrays': 'always-multiline',
            'objects': 'always-multiline',
            'imports': 'always-multiline',
            'exports': 'always-multiline',
            'functions': 'always-multiline',
        }],

        'jsdoc/require-jsdoc': ['error', { require: { 'MethodDefinition': true } }],
        'jsdoc/require-param-type': 0,
        'jsdoc/require-returns': 0,
        'jsdoc/require-returns-type': 0,
        'jsdoc/check-param-names': 2,

        '@typescript-eslint/explicit-function-return-type': ['error'],
        '@typescript-eslint/no-empty-function': 0,

        // I use them rarely but they are understandable and commented. They simplify the code.
        '@typescript-eslint/no-non-null-assertion': 0,
        '@typescript-eslint/no-non-null-asserted-optional-chain': 0,

        // Ignore args starting with an underscore.
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    },
};
