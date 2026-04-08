import { beforeEach, describe, expect, test, vi } from 'vitest';

const { mockRenderDocumentHtml, mockResolveSeoApiBaseUrl } = vi.hoisted(() => ({
    mockRenderDocumentHtml: vi.fn(),
    mockResolveSeoApiBaseUrl: vi.fn(() => 'https://api.sealed.vote'),
}));

vi.mock('./documentSeo.ts', () => ({
    renderDocumentHtml: mockRenderDocumentHtml,
    resolveSeoApiBaseUrl: mockResolveSeoApiBaseUrl,
}));

describe('vote SEO edge function', () => {
    beforeEach(() => {
        vi.resetModules();
        mockRenderDocumentHtml.mockReset();
        mockResolveSeoApiBaseUrl.mockClear();
    });

    test('returns the original HTML response body when SEO injection fails', async () => {
        mockRenderDocumentHtml.mockRejectedValue(
            new Error('marker parse failed'),
        );

        const edgeFunctionModule =
            await import('../../../netlify/edge-functions/vote-seo');
        const originalHtml =
            '<!doctype html><html><head><title>sealed.vote</title></head><body>home</body></html>';
        const response = await edgeFunctionModule.default(
            new Request('https://sealed.vote/'),
            {
                next: async () =>
                    new Response(originalHtml, {
                        headers: {
                            'content-type': 'text/html; charset=utf-8',
                        },
                        status: 200,
                    }),
            },
        );

        expect(mockRenderDocumentHtml).toHaveBeenCalledWith({
            apiBaseUrl: 'https://api.sealed.vote',
            baseHtml: originalHtml,
            requestUrl: new URL('https://sealed.vote/'),
            signal: expect.any(AbortSignal),
        });
        await expect(response.text()).resolves.toBe(originalHtml);
    });
});
