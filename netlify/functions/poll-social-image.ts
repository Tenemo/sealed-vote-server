import { Buffer } from 'node:buffer';

import { resolveSeoApiBaseUrl } from '../../apps/web/config/document-seo.ts';
import {
    createPollSocialImageResponse,
    extractPollSocialImageSlugFromPathname,
    extractPollSocialImageVariantFromSearchParams,
} from '../../apps/web/config/poll-social-image.ts';

type NetlifyFunctionContext = {
    params?: Record<string, string | undefined>;
};

const seoApiBaseUrl = resolveSeoApiBaseUrl(process.env.VITE_API_BASE_URL);

const createPollSocialImageErrorResponse = (requestMethod: string): Response =>
    new Response(requestMethod === 'HEAD' ? null : 'Failed to render image.', {
        headers: {
            'cache-control': 'no-store, max-age=0',
            'content-type': 'text/plain; charset=utf-8',
        },
        status: 500,
    });

export const config = {
    path: '/social/polls/:slug.png',
};

export default async (
    request: Request,
    context: NetlifyFunctionContext,
): Promise<Response> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, {
            headers: {
                allow: 'GET, HEAD',
            },
            status: 405,
        });
    }

    const requestUrl = new URL(request.url);
    const pollSlug =
        context.params?.slug ||
        extractPollSocialImageSlugFromPathname(requestUrl.pathname);
    const variant = extractPollSocialImageVariantFromSearchParams(
        requestUrl.searchParams,
    );

    if (!pollSlug) {
        return new Response(null, {
            status: 404,
        });
    }

    try {
        const pollSocialImageResponse = await createPollSocialImageResponse({
            apiBaseUrl: seoApiBaseUrl,
            pollSlug,
            signal: AbortSignal.timeout(5000),
            variant,
        });

        return new Response(
            request.method === 'HEAD'
                ? null
                : Buffer.from(pollSocialImageResponse.body),
            {
                headers: pollSocialImageResponse.headers,
                status: pollSocialImageResponse.status,
            },
        );
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Failed to render poll social image.',
        );

        return createPollSocialImageErrorResponse(request.method);
    }
};
