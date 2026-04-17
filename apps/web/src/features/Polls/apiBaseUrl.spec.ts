import { describe, expect, test } from 'vitest';

import { resolveBrowserApiBaseUrl } from './apiBaseUrl';

describe('resolveBrowserApiBaseUrl', () => {
    test('uses the configured API origin on production hosts', () => {
        expect(
            resolveBrowserApiBaseUrl({
                configuredApiBaseUrl: 'https://api.sealed.vote/',
            }),
        ).toBe('https://api.sealed.vote');
    });

    test('keeps local and custom deployments on their configured API origin', () => {
        expect(
            resolveBrowserApiBaseUrl({
                configuredApiBaseUrl: 'http://127.0.0.1:4000/',
            }),
        ).toBe('http://127.0.0.1:4000');
        expect(
            resolveBrowserApiBaseUrl({
                configuredApiBaseUrl: 'https://api.example.com/',
            }),
        ).toBe('https://api.example.com');
    });

    test('falls back to the current origin root when no API origin is configured', () => {
        expect(resolveBrowserApiBaseUrl({})).toBe('/');
    });

    test('treats blank configured API origins as missing', () => {
        expect(
            resolveBrowserApiBaseUrl({
                configuredApiBaseUrl: '   ',
            }),
        ).toBe('/');
    });
});
