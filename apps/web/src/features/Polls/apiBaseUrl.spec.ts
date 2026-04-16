import { describe, expect, test } from 'vitest';

import {
    resolveBrowserApiBaseUrl,
    shouldUseSameOriginApiProxy,
} from './apiBaseUrl';

describe('shouldUseSameOriginApiProxy', () => {
    test('uses the same-origin proxy on the production web origin', () => {
        expect(shouldUseSameOriginApiProxy('https://sealed.vote')).toBe(true);
        expect(shouldUseSameOriginApiProxy('https://www.sealed.vote')).toBe(
            true,
        );
    });

    test('uses the same-origin proxy on deploy preview origins', () => {
        expect(
            shouldUseSameOriginApiProxy(
                'https://deploy-preview-42--sealed-vote.netlify.app',
            ),
        ).toBe(true);
    });

    test('does not use the same-origin proxy on local or malformed origins', () => {
        expect(shouldUseSameOriginApiProxy('http://127.0.0.1:3000')).toBe(
            false,
        );
        expect(shouldUseSameOriginApiProxy('notaurl')).toBe(false);
        expect(shouldUseSameOriginApiProxy()).toBe(false);
    });
});

describe('resolveBrowserApiBaseUrl', () => {
    test('forces the production browser path through the same-origin proxy', () => {
        expect(
            resolveBrowserApiBaseUrl({
                browserOrigin: 'https://sealed.vote',
                configuredApiBaseUrl: 'https://api.sealed.vote',
            }),
        ).toBe('/');
    });

    test('keeps local and custom deployments on their configured API origin', () => {
        expect(
            resolveBrowserApiBaseUrl({
                browserOrigin: 'http://127.0.0.1:3000',
                configuredApiBaseUrl: 'http://127.0.0.1:4000/',
            }),
        ).toBe('http://127.0.0.1:4000');
        expect(
            resolveBrowserApiBaseUrl({
                browserOrigin: 'https://vote.example.com',
                configuredApiBaseUrl: 'https://api.example.com/',
            }),
        ).toBe('https://api.example.com');
    });

    test('falls back to the current origin root when no API origin is configured', () => {
        expect(
            resolveBrowserApiBaseUrl({
                browserOrigin: 'http://127.0.0.1:3000',
            }),
        ).toBe('/');
    });
});
