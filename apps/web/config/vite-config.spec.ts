// @vitest-environment node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import viteConfig from '../vite.config';

type AliasEntry = {
    find: string | RegExp;
    replacement: string;
};

const normalizeAliasEntries = (
    alias: readonly AliasEntry[] | Record<string, string> | undefined,
): AliasEntry[] => {
    if (!alias) {
        return [];
    }

    if (Array.isArray(alias)) {
        return alias;
    }

    return Object.entries(alias).map(([find, replacement]) => ({
        find,
        replacement,
    }));
};

const require = createRequire(import.meta.url);
const configDir = fileURLToPath(new URL('.', import.meta.url));
const repositoryRootDirectory = path.resolve(configDir, '..', '..', '..');
const rootPackageJsonUrl = new URL('../../../package.json', import.meta.url);
const rootTslibEntryPath = require.resolve('tslib/tslib.es6.mjs', {
    paths: [repositoryRootDirectory],
});

describe('vite config', () => {
    it('pins tslib to the repo-root install instead of a workspace-local path', () => {
        // Netlify's filtered workspace install can break pnpm's nested fallback
        // links, which leaves Rolldown unable to resolve bare tslib imports
        // from packages inside node_modules/.pnpm. The alias must point at the
        // repo-root install tree rather than apps/web/node_modules.
        const aliasEntries = normalizeAliasEntries(viteConfig.resolve?.alias);
        const tslibAlias = aliasEntries.find((entry) => entry.find === 'tslib');

        expect(tslibAlias).toEqual({
            find: 'tslib',
            replacement: rootTslibEntryPath,
        });
        expect(rootTslibEntryPath).not.toContain(
            path.join('apps', 'web', 'node_modules'),
        );
        expect(viteConfig.resolve?.dedupe ?? []).not.toContain('tslib');
    });

    it('keeps tslib resolvable from the repo root install tree', () => {
        // Rolldown resolves some third-party bare imports from the repo root
        // when bundling packages under node_modules/.pnpm. Netlify can end up
        // without the hidden .pnpm/node_modules/tslib fallback, so the root
        // manifest must keep a direct tslib entry and the root install must
        // resolve it without relying on any workspace-local symlink.
        const rootPackageJson = JSON.parse(
            fs.readFileSync(rootPackageJsonUrl, 'utf8'),
        ) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const rootTslibVersion =
            rootPackageJson.dependencies?.tslib ??
            rootPackageJson.devDependencies?.tslib;

        expect(rootTslibVersion).toBeDefined();
        expect(rootTslibEntryPath).toBe(
            require.resolve('tslib/tslib.es6.mjs', {
                paths: [repositoryRootDirectory],
            }),
        );
    });
});
