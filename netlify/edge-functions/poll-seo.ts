import {
    createPollSeoPayloadCache,
    renderDocumentHtml,
    resolveSeoApiBaseUrl,
} from '../../apps/web/config/document-seo.ts';

type EdgeContext = {
    next: () => Promise<Response>;
};

type NetlifyGlobal = {
    env?: {
        get?: (key: string) => string | undefined;
    };
};

const readRuntimeEnvironmentValue = (key: string): string | undefined => {
    return (globalThis as { Netlify?: NetlifyGlobal }).Netlify?.env?.get?.(key);
};

const getPollPayloadCache = (() => {
    let pollPayloadCache: ReturnType<typeof createPollSeoPayloadCache> | null =
        null;

    return (): ReturnType<typeof createPollSeoPayloadCache> => {
        if (pollPayloadCache === null) {
            pollPayloadCache = createPollSeoPayloadCache();
        }

        return pollPayloadCache;
    };
})();

const isHtmlResponse = (response: Response): boolean =>
    (response.headers.get('content-type') || '').includes('text/html');

export default async (
    request: Request,
    context: EdgeContext,
): Promise<Response> => {
    if (request.method !== 'GET') {
        return context.next();
    }

    const response = await context.next();

    if (!isHtmlResponse(response)) {
        return response;
    }

    try {
        const html = await response.clone().text();
        const updatedHtml = await renderDocumentHtml({
            apiBaseUrl: resolveSeoApiBaseUrl(
                readRuntimeEnvironmentValue('VITE_API_BASE_URL'),
            ),
            baseHtml: html,
            pollPayloadCache: getPollPayloadCache(),
            requestUserAgent: request.headers.get('user-agent'),
            requestUrl: new URL(request.url),
            signal: AbortSignal.timeout(5000),
        });
        const headers = new Headers(response.headers);

        headers.set('content-type', 'text/html; charset=utf-8');
        headers.delete('content-encoding');
        headers.delete('content-length');
        headers.delete('etag');
        headers.delete('last-modified');

        return new Response(updatedHtml, {
            headers,
            status: response.status,
            statusText: response.statusText,
        });
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Failed to inject poll SEO metadata.',
        );

        return response;
    }
};
