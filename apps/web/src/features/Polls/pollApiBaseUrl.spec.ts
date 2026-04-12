import { describe, expect, it } from 'vitest';

import { normalizePollApiBaseUrl } from './pollApiBaseUrl';

describe('normalizePollApiBaseUrl', () => {
    it('uses the site root when the environment variable is missing', () => {
        expect(normalizePollApiBaseUrl(undefined)).toBe('/');
        expect(normalizePollApiBaseUrl(null)).toBe('/');
    });

    it('keeps absolute API origins while trimming whitespace and trailing slashes', () => {
        expect(normalizePollApiBaseUrl('  https://api.sealed.vote///  ')).toBe(
            'https://api.sealed.vote',
        );
    });

    it('falls back to the site root when only slashes are configured', () => {
        expect(normalizePollApiBaseUrl('/')).toBe('/');
        expect(normalizePollApiBaseUrl('////')).toBe('/');
        expect(normalizePollApiBaseUrl('  ///  ')).toBe('/');
    });
});
