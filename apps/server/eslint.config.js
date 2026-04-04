import path from 'path';
import { fileURLToPath } from 'url';

import { FlatCompat } from '@eslint/eslintrc';
import eslintJs from '@eslint/js';
import sqlPlugin from 'eslint-plugin-sql';

import legacyConfig from './.eslintrc.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: eslintJs.configs.recommended,
});

const { plugins = [], rules = {}, ...legacyConfigWithoutPlugins } = legacyConfig;
const { 'sql/no-unsafe-query': sqlNoUnsafeQueryRule, ...legacyRules } = rules;

export default [
    {
        ignores: [
            'node_modules/*',
            '.tmp/*',
            'dist/*',
            '.eslintrc.cjs',
            'eslint.config.js',
        ],
    },
    ...compat.config({
        ...legacyConfigWithoutPlugins,
        plugins: plugins.filter((pluginName) => pluginName !== 'sql'),
        rules: legacyRules,
    }),
    {
        plugins: {
            sql: sqlPlugin,
        },
        rules: {
            'sql/no-unsafe-query': sqlNoUnsafeQueryRule,
        },
    },
];
