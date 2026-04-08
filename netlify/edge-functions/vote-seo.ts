import {
    renderDocumentHtml,
    resolveSeoApiBaseUrl,
} from '../../apps/web/config/documentSeo.ts';

type EdgeContext = {
    next: () => Promise<Response>;
};

const edgeProcessEnv = (
    globalThis as {
        process?: {
            env?: Record<string, string | undefined>;
        };
    }
).process?.env;

const seoApiBaseUrl = resolveSeoApiBaseUrl(edgeProcessEnv?.VITE_API_BASE_URL);

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
            apiBaseUrl: seoApiBaseUrl,
            baseHtml: html,
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
                : 'Failed to inject vote SEO metadata.',
        );

        return response;
    }
};
