import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const {
    mockCreatePollSeoPayloadCache,
    mockRenderDocumentHtml,
    mockResolveSeoApiBaseUrl,
} = vi.hoisted(() => ({
    mockCreatePollSeoPayloadCache: vi.fn(() => new Map()),
    mockRenderDocumentHtml: vi.fn(),
    mockResolveSeoApiBaseUrl: vi.fn(() => 'https://api.sealed.vote'),
}));

vi.mock('./document-seo.ts', () => ({
    createPollSeoPayloadCache: mockCreatePollSeoPayloadCache,
    renderDocumentHtml: mockRenderDocumentHtml,
    resolveSeoApiBaseUrl: mockResolveSeoApiBaseUrl,
}));

describe('poll SEO edge function', () => {
    const originalNetlifyGlobal = (globalThis as { Netlify?: unknown }).Netlify;

    // These tests focus on edge-runtime behavior rather than page rendering.
    // They guard module-scope caching and safe HTML passthrough in the Netlify
    // edge environment, which are both easy to break with refactors.
    beforeEach(() => {
        vi.resetModules();
        (
            globalThis as {
                Netlify?: {
                    env?: {
                        get?: (key: string) => string | undefined;
                    };
                };
            }
        ).Netlify = {
            env: {
                get: vi.fn(() => 'https://api.preview.sealed.vote'),
            },
        };
        mockCreatePollSeoPayloadCache.mockReset();
        mockCreatePollSeoPayloadCache.mockImplementation(() => new Map());
        mockRenderDocumentHtml.mockReset();
        mockResolveSeoApiBaseUrl.mockClear();
    });

    afterEach(() => {
        if (originalNetlifyGlobal === undefined) {
            delete (globalThis as { Netlify?: unknown }).Netlify;
            return;
        }

        (globalThis as { Netlify?: unknown }).Netlify = originalNetlifyGlobal;
    });

    test('returns the original HTML response body when SEO injection fails', async () => {
        mockRenderDocumentHtml.mockRejectedValue(
            new Error('marker parse failed'),
        );

        const edgeFunctionModule =
            await import('../../../netlify/edge-functions/poll-seo');
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
            pollPayloadCache: expect.any(Map),
            requestUserAgent: null,
            requestUrl: new URL('https://sealed.vote/'),
            signal: expect.any(AbortSignal),
        });
        expect(mockResolveSeoApiBaseUrl).toHaveBeenCalledWith(
            'https://api.preview.sealed.vote',
        );
        await expect(response.text()).resolves.toBe(originalHtml);
    });

    test('reuses the poll payload cache between edge requests', async () => {
        const pollPayloadCache = new Map();
        mockCreatePollSeoPayloadCache.mockReturnValue(pollPayloadCache);
        mockRenderDocumentHtml.mockResolvedValue(
            '<!doctype html><html></html>',
        );

        const edgeFunctionModule =
            await import('../../../netlify/edge-functions/poll-seo');
        const createContext = (): {
            next: () => Promise<Response>;
        } => ({
            next: async () =>
                new Response('<!doctype html><html></html>', {
                    headers: {
                        'content-type': 'text/html; charset=utf-8',
                    },
                    status: 200,
                }),
        });

        await edgeFunctionModule.default(
            new Request('https://sealed.vote/polls/team-sync'),
            createContext(),
        );
        await edgeFunctionModule.default(
            new Request('https://sealed.vote/polls/team-sync'),
            createContext(),
        );

        expect(mockCreatePollSeoPayloadCache).toHaveBeenCalledTimes(1);
        expect(mockRenderDocumentHtml.mock.calls[0]?.[0].pollPayloadCache).toBe(
            pollPayloadCache,
        );
        expect(mockRenderDocumentHtml.mock.calls[1]?.[0].pollPayloadCache).toBe(
            pollPayloadCache,
        );
    });
});
