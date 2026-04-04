import path from 'path';
import { fileURLToPath } from 'url';

// Bugged: https://github.com/import-js/eslint-plugin-import/issues/2556
import { FlatCompat } from '@eslint/eslintrc';
import eslintJs from '@eslint/js';
import errorOnlyPlugin from 'eslint-plugin-only-error';
import prettierPluginRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
// Doesn't work otherwise
// eslint-disable-next-line import/extensions
import reactPluginRecommended from 'eslint-plugin-react/configs/recommended.js';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';
import globals from 'globals';

const OFF = 0;
const ERROR = 2;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

export default [
    ...compat.config({
        extends: [
            'plugin:import/errors', // adds eslint-plugin-import
            'plugin:import/warnings',
            'plugin:jest/recommended', // adds eslint-plugin-jest
            'plugin:jsx-a11y/strict', // adds eslint-plugin-jsx-a11y
        ],
        parser: '@typescript-eslint/parser',
        parserOptions: {
            parser: '@typescript-eslint/parser',
            sourceType: 'module',
            ecmaFeatures: {
                jsx: true,
            },
            project: './tsconfig.json',
            ecmaVersion: 2021,
        },
        plugins: ['only-error'],
        settings: {
            react: {
                version: 'detect',
            },
            'import/resolver': {
                typescript: {}, // eslint-import-resolver-typescript
            },
        },
    }),
    securityPlugin.configs.recommended,
    prettierPluginRecommended,
    {
        files: ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mjs'],
        ...reactPluginRecommended,
        rules: {
            ...eslintJs.configs.recommended.rules,
            'arrow-parens': [ERROR, 'always', { requireForBlockBody: false }],
            'no-restricted-exports': OFF,
            'no-shadow': OFF, // duplicated by @typescript-eslint/no-shadow

            // @typescript-eslint/eslint-plugin
            '@typescript-eslint/no-use-before-define': ERROR,
            '@typescript-eslint/no-shadow': ERROR,
            '@typescript-eslint/explicit-module-boundary-types': ERROR,
            '@typescript-eslint/unbound-method': ERROR,
            '@typescript-eslint/explicit-function-return-type': [
                ERROR,
                {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                },
            ],
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
            '@typescript-eslint/ban-ts-comment': [
                ERROR,
                {
                    'ts-expect-error': false,
                },
            ],

            // eslint-plugin-prettier
            'prettier/prettier': [
                ERROR,
                {
                    useTabs: false,
                    semi: true,
                    singleQuote: true,
                    jsxSingleQuote: false,
                    trailingComma: 'all',
                    arrowParens: 'always',
                },
            ],

            // eslint-plugin-react
            'react/destructuring-assignment': [ERROR, 'always'],
            'react/jsx-filename-extension': [
                ERROR,
                {
                    extensions: ['.tsx'],
                },
            ],
            'react/jsx-sort-props': ERROR,
            'react/static-property-placement': [ERROR, 'static public field'],
            'react/state-in-constructor': [ERROR, 'never'],
            'react/display-name': [
                ERROR,
                {
                    ignoreTranspilerName: false,
                },
            ],
            'react/function-component-definition': [
                ERROR,
                {
                    namedComponents: 'arrow-function',
                    unnamedComponents: 'arrow-function',
                },
            ],

            // eslint-plugin-react-hooks
            'react-hooks/rules-of-hooks': ERROR,
            'react-hooks/exhaustive-deps': ERROR,

            // eslint-plugin-jsx-a11y
            'jsx-a11y/label-has-for': [ERROR, { required: { every: ['id'] } }],

            // eslint-plugin-import
            'import/no-extraneous-dependencies': [
                ERROR,
                { devDependencies: true },
            ],
            'import/prefer-default-export': OFF,
            'import/extensions': [
                ERROR,
                'ignorePackages',
                {
                    js: 'never',
                    jsx: 'never',
                    ts: 'never',
                    tsx: 'never',
                },
            ],
            'import/order': [
                'error',
                {
                    'newlines-between': 'always',
                    alphabetize: { order: 'asc', caseInsensitive: true },
                    pathGroupsExcludedImportTypes: ['builtin'],
                },
            ],

            // eslint-plugin-security
            'security/detect-object-injection': OFF,

            // eslint-plugin-jest
            'jest/no-commented-out-tests': ERROR,
        },
        plugins: {
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
            'only-error': errorOnlyPlugin,
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
                ...globals.commonjs,
                ...globals.jest,
            },
        },
    },
    ...compat.config({
        extends: [
            'plugin:@typescript-eslint/recommended-requiring-type-checking', // adds @typescript-eslint plugin
            'plugin:@typescript-eslint/stylistic-type-checked',
            'plugin:import/typescript',
        ],
        overrides: [
            {
                files: ['**/*.mjs', '**/*.js', '**/*.jsx', 'eslint.config.mjs'],
                rules: {
                    '@typescript-eslint/no-unsafe-assignment': OFF,
                    '@typescript-eslint/no-unsafe-member-access': OFF,
                    '@typescript-eslint/no-unsafe-call': OFF,
                },
            },
        ],
    }),
    {
        files: ['**/*.scss.d.ts'],
        rules: {
            'prettier/prettier': OFF,
            '@typescript-eslint/consistent-type-definitions': OFF,
        },
    },
    {
        files: ['**/*.spec.ts', '**/*.spec.tsx'],
        rules: {
            '@typescript-eslint/ban-ts-comment': OFF,
            '@typescript-eslint/no-unsafe-return': OFF,
            '@typescript-eslint/no-unsafe-member-access': OFF,
            '@typescript-eslint/require-await': OFF,
        },
    },
    {
        ignores: [
            'node_modules/*',
            '.tmp/*',
            'coverage/*',
            'dist/*',
            '**/*.html',
        ],
    },
];
