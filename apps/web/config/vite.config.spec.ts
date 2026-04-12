// @vitest-environment node

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

describe('vite config', () => {
    it('does not pin tslib to the workspace-local node_modules path', () => {
        // Netlify's filtered workspace install can omit apps/web/node_modules/tslib
        // even though transitive dependency resolution is still valid. This test
        // guards against reintroducing a brittle alias/dedupe override that makes
        // the build depend on that workspace-local pnpm symlink existing.
        const aliasEntries = normalizeAliasEntries(viteConfig.resolve?.alias);
        const tslibAlias = aliasEntries.find((entry) => entry.find === 'tslib');

        expect(tslibAlias).toBeUndefined();
        expect(viteConfig.resolve?.dedupe ?? []).not.toContain('tslib');
    });
});
