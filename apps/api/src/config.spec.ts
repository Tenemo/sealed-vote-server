import { afterEach, describe, expect, test } from 'vitest';

import { getConfiguredWebAppOrigin } from './config';

const originalWebAppOrigin = process.env.WEB_APP_ORIGIN;

afterEach(() => {
    if (originalWebAppOrigin === undefined) {
        delete process.env.WEB_APP_ORIGIN;
        return;
    }

    process.env.WEB_APP_ORIGIN = originalWebAppOrigin;
});

describe('getConfiguredWebAppOrigin', () => {
    test('returns null when WEB_APP_ORIGIN is not set', () => {
        delete process.env.WEB_APP_ORIGIN;

        expect(getConfiguredWebAppOrigin()).toBeNull();
    });

    test('normalizes a configured origin to its origin value', () => {
        process.env.WEB_APP_ORIGIN = 'https://preview-web.up.railway.app/path';

        expect(getConfiguredWebAppOrigin()).toBe(
            'https://preview-web.up.railway.app',
        );
    });

    test('rejects invalid URLs', () => {
        process.env.WEB_APP_ORIGIN = 'not-a-url';

        expect(() => getConfiguredWebAppOrigin()).toThrow(
            'WEB_APP_ORIGIN must be a valid absolute URL.',
        );
    });

    test('rejects unsupported protocols', () => {
        process.env.WEB_APP_ORIGIN = 'ftp://preview-web.up.railway.app';

        expect(() => getConfiguredWebAppOrigin()).toThrow(
            'WEB_APP_ORIGIN must use http or https.',
        );
    });
});
