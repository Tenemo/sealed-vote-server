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
        const aliasEntries = normalizeAliasEntries(viteConfig.resolve?.alias);
        const tslibAlias = aliasEntries.find((entry) => entry.find === 'tslib');

        expect(tslibAlias).toBeUndefined();
        expect(viteConfig.resolve?.dedupe ?? []).not.toContain('tslib');
    });
});
