const { fixupConfigRules, fixupPluginRules } = require('@eslint/compat');
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const { flatConfigs: importConfigs } = require('eslint-plugin-import');
const jsxA11yPlugin = require('eslint-plugin-jsx-a11y');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const securityPlugin = require('eslint-plugin-security');
const sqlPlugin = require('eslint-plugin-sql').default;
const globals = require('globals');
const tseslint = require('typescript-eslint');

const ERROR = 2;
const OFF = 0;

const allSourceFiles = ['**/*.{js,jsx,cjs,mjs,ts,tsx}'];
const allTestFiles = ['**/*.spec.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}'];
const frontendFiles = ['apps/web/src/**/*.{js,jsx,ts,tsx}'];
const apiFiles = ['apps/api/**/*.{js,ts}'];
const netlifyFiles = ['netlify/**/*.{js,ts}'];

const sharedProjects = [
    './tsconfig.root.json',
    './apps/api/tsconfig.json',
    './apps/web/tsconfig.json',
    './packages/contracts/tsconfig.json',
    './packages/protocol/tsconfig.json',
    './packages/testkit/tsconfig.json',
];

const prettierRule = [
    ERROR,
    {
        tabWidth: 4,
        printWidth: 80,
        endOfLine: 'lf',
        useTabs: false,
        semi: true,
        singleQuote: true,
        jsxSingleQuote: false,
        trailingComma: 'all',
        arrowParens: 'always',
    },
];

const sharedRules = {
    'prettier/prettier': prettierRule,
    'arrow-parens': [ERROR, 'always', { requireForBlockBody: false }],
    'no-restricted-exports': OFF,
    'no-shadow': OFF,
    'import/no-extraneous-dependencies': [ERROR, { devDependencies: true }],
    'import/prefer-default-export': OFF,
    'import/no-named-as-default-member': OFF,
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
    'import/order': OFF,
    '@typescript-eslint/no-use-before-define': ERROR,
    '@typescript-eslint/no-shadow': ERROR,
    '@typescript-eslint/explicit-module-boundary-types': ERROR,
    '@typescript-eslint/explicit-function-return-type': [
        ERROR,
        {
            allowExpressions: true,
            allowTypedFunctionExpressions: true,
        },
    ],
    '@typescript-eslint/consistent-type-definitions': [ERROR, 'type'],
    'security/detect-object-injection': OFF,
};

const frontendRules = {
    'react/jsx-uses-vars': ERROR,
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
    'react-hooks/rules-of-hooks': ERROR,
    'react-hooks/exhaustive-deps': ERROR,
    'jsx-a11y/label-has-for': [ERROR, { required: { every: ['id'] } }],
};

const reactCompatPlugin = fixupPluginRules(reactPlugin);

module.exports = defineConfig(
    {
        ignores: [
            '**/node_modules/*',
            '**/.turbo/*',
            '**/.tmp/*',
            '**/coverage/*',
            '**/dist/*',
            '**/*.html',
            'apps/web/temp/*',
            'packages/*/src/**/*.d.ts',
            'packages/*/src/**/*.js',
            'eslint.config.js',
        ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    importConfigs.recommended,
    importConfigs.typescript,
    importConfigs.errors,
    importConfigs.warnings,
    ...fixupConfigRules([securityPlugin.configs.recommended]),
    prettierRecommended,
    {
        files: allSourceFiles,
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            prettier: prettierPlugin,
        },
        settings: {
            'import/resolver': {
                typescript: {
                    noWarnOnMultipleProjects: true,
                    project: sharedProjects,
                },
            },
        },
        languageOptions: {
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 2021,
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.node,
                ...globals.es2021,
                ...globals.commonjs,
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        rules: sharedRules,
    },
    ...fixupConfigRules({
        ...reactPlugin.configs.flat.recommended,
        files: frontendFiles,
    }),
    ...fixupConfigRules({
        ...reactPlugin.configs.flat['jsx-runtime'],
        files: frontendFiles,
    }),
    {
        ...jsxA11yPlugin.flatConfigs.strict,
        files: frontendFiles,
    },
    {
        files: frontendFiles,
        plugins: {
            react: reactCompatPlugin,
            'react-hooks': reactHooksPlugin,
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: frontendRules,
    },
    {
        files: apiFiles,
        plugins: {
            sql: sqlPlugin,
        },
        rules: {
            'sql/no-unsafe-query': [
                ERROR,
                {
                    allowLiteral: false,
                },
            ],
        },
    },
    {
        files: netlifyFiles,
        rules: {
            'import/extensions': [
                ERROR,
                'ignorePackages',
                {
                    js: 'never',
                    ts: 'always',
                },
            ],
        },
    },
    {
        files: allTestFiles,
        languageOptions: {
            globals: {
                ...globals.vitest,
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
            },
        },
    },
    {
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/consistent-type-definitions': OFF,
        },
    },
);
