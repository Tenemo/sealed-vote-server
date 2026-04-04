import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { flatConfigs as importConfigs } from 'eslint-plugin-import';
import jestPlugin from 'eslint-plugin-jest';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierPluginRecommended from 'eslint-plugin-prettier/recommended';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';
import sqlPlugin from 'eslint-plugin-sql';
import globals from 'globals';
import { configs as tsConfigs, plugin as tsPlugin } from 'typescript-eslint';

const OFF = 0;
const ERROR = 2;
const SOURCE_FILES = ['**/*.{js,jsx,mjs,cjs,ts,tsx}'];
const TEST_FILES = ['**/*.spec.{ts,tsx,js,jsx}', '**/*.test.{ts,tsx,js,jsx}'];

const PRETTIER_RULE = [
    ERROR,
    {
        useTabs: false,
        semi: true,
        singleQuote: true,
        jsxSingleQuote: false,
        trailingComma: 'all',
        arrowParens: 'always',
    },
];

const readTsconfigPaths = (workspaceDir) => {
    const tsconfigPath = path.join(workspaceDir, 'tsconfig.json');

    if (!existsSync(tsconfigPath)) {
        return {};
    }

    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
    const compilerOptions =
        typeof tsconfig === 'object' && tsconfig !== null
            ? tsconfig.compilerOptions
            : undefined;

    if (
        typeof compilerOptions !== 'object' ||
        compilerOptions === null ||
        typeof compilerOptions.paths !== 'object' ||
        compilerOptions.paths === null
    ) {
        return {};
    }

    return compilerOptions.paths;
};

const createInternalRegex = (paths) => {
    const aliases = Object.keys(paths)
        .map((aliasPattern) => aliasPattern.replace(/\/\*$/, ''))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
        .map((aliasPattern) =>
            aliasPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        );

    if (aliases.length === 0) {
        return undefined;
    }

    return `^(${aliases.join('|')})(/|$)`;
};

const createBaseGlobals = (environment) => ({
    ...globals.node,
    ...globals.es2021,
    ...globals.commonjs,
    ...(environment === 'browser' ? globals.browser : {}),
});

export const createWorkspaceConfig = ({
    configFileUrl,
    environment = 'node',
    includeReact = false,
    includeJest = false,
    includeSql = false,
    allowRequireAwait = false,
    extraIgnores = [],
    extraConfigs = [],
}) => {
    const workspaceDir = path.dirname(fileURLToPath(configFileUrl));
    const tsconfigFile = existsSync(path.join(workspaceDir, 'tsconfig.eslint.json'))
        ? './tsconfig.eslint.json'
        : './tsconfig.json';
    const srcAliasPattern = createInternalRegex(readTsconfigPaths(workspaceDir));

    const config = [
        {
            ignores: [
                'node_modules/*',
                '.turbo/*',
                '.tmp/*',
                'coverage/*',
                'dist/*',
                '**/*.html',
                'eslint.config.js',
                ...extraIgnores,
            ],
        },
        eslint.configs.recommended,
        ...tsConfigs.recommendedTypeChecked,
        ...fixupConfigRules([
            importConfigs.recommended,
            importConfigs.typescript,
            importConfigs.errors,
            importConfigs.warnings,
            securityPlugin.configs.recommended,
            ...(includeReact
                ? [
                      reactPlugin.configs.flat.recommended,
                      reactPlugin.configs.flat['jsx-runtime'],
                      jsxA11yPlugin.flatConfigs.strict,
                  ]
                : []),
        ]),
        prettierPluginRecommended,
        {
            files: SOURCE_FILES,
            plugins: {
                '@typescript-eslint': tsPlugin,
                ...(includeReact
                    ? {
                          'react-hooks': fixupPluginRules(reactHooksPlugin),
                      }
                    : {}),
                prettier: prettierPlugin,
                ...(includeSql ? { sql: sqlPlugin } : {}),
            },
            settings: {
                ...(includeReact
                    ? {
                          react: {
                              version: 'detect',
                          },
                      }
                    : {}),
                ...(srcAliasPattern
                    ? {
                          'import/internal-regex': srcAliasPattern,
                      }
                    : {}),
                'import/resolver': {
                    typescript: {
                        project: tsconfigFile,
                    },
                },
            },
            languageOptions: {
                parserOptions: {
                    project: tsconfigFile,
                    tsconfigRootDir: workspaceDir,
                    sourceType: 'module',
                    ecmaVersion: 2021,
                    ecmaFeatures: {
                        jsx: includeReact,
                    },
                },
                globals: createBaseGlobals(environment),
            },
            linterOptions: {
                reportUnusedDisableDirectives: true,
            },
            rules: {
                'prettier/prettier': PRETTIER_RULE,
                'arrow-parens': [
                    ERROR,
                    'always',
                    { requireForBlockBody: false },
                ],
                'no-restricted-exports': OFF,
                'no-shadow': OFF,

                'import/no-extraneous-dependencies': [
                    ERROR,
                    { devDependencies: true },
                ],
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
                'import/order': [
                    ERROR,
                    {
                        'newlines-between': 'always',
                        alphabetize: { order: 'asc', caseInsensitive: true },
                        pathGroupsExcludedImportTypes: ['builtin'],
                    },
                ],

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
                '@typescript-eslint/consistent-type-definitions': [
                    ERROR,
                    'type',
                ],

                ...(allowRequireAwait
                    ? {
                          '@typescript-eslint/require-await': OFF,
                      }
                    : {}),

                ...(includeReact
                    ? {
                          'react/jsx-uses-react': ERROR,
                          'react/jsx-uses-vars': ERROR,
                          'react/destructuring-assignment': [
                              ERROR,
                              'always',
                          ],
                          'react/jsx-filename-extension': [
                              ERROR,
                              {
                                  extensions: ['.tsx'],
                              },
                          ],
                          'react/jsx-sort-props': ERROR,
                          'react/static-property-placement': [
                              ERROR,
                              'static public field',
                          ],
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
                          'jsx-a11y/label-has-for': [
                              ERROR,
                              { required: { every: ['id'] } },
                          ],
                      }
                    : {}),

                ...(includeSql
                    ? {
                          'sql/no-unsafe-query': [
                              ERROR,
                              {
                                  allowLiteral: false,
                              },
                          ],
                      }
                    : {}),

                'security/detect-object-injection': OFF,
            },
        },
        {
            files: ['**/*.{js,jsx,mjs,cjs}'],
            rules: {
                '@typescript-eslint/no-unsafe-assignment': OFF,
                '@typescript-eslint/no-unsafe-argument': OFF,
                '@typescript-eslint/no-unsafe-member-access': OFF,
                '@typescript-eslint/no-unsafe-call': OFF,
            },
        },
        {
            files: TEST_FILES,
            languageOptions: {
                globals: {
                    ...createBaseGlobals(environment),
                    ...globals.jest,
                },
            },
            rules: {
                '@typescript-eslint/ban-ts-comment': OFF,
                '@typescript-eslint/no-unsafe-return': OFF,
                '@typescript-eslint/no-unsafe-member-access': OFF,
                '@typescript-eslint/require-await': OFF,
            },
        },
        {
            files: ['**/*.scss.d.ts'],
            rules: {
                'prettier/prettier': OFF,
                '@typescript-eslint/consistent-type-definitions': OFF,
                '@typescript-eslint/no-empty-object-type': OFF,
            },
        },
        ...extraConfigs,
    ];

    if (includeJest) {
        config.push({
            files: TEST_FILES,
            plugins: {
                jest: fixupPluginRules(jestPlugin),
            },
            rules: {
                ...jestPlugin.configs['flat/recommended'].rules,
                'jest/no-commented-out-tests': ERROR,
            },
        });
    }

    return defineConfig(...config);
};
