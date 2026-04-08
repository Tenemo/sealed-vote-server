import { Buffer } from 'node:buffer';

import {
    createVoteSocialImageResponse,
    extractVoteSocialImageSlugFromPathname,
} from '../../apps/web/config/voteSocialImage.ts';
import { resolveSeoApiBaseUrl } from '../../apps/web/config/documentSeo.ts';

type NetlifyFunctionContext = {
    params?: Record<string, string | undefined>;
};

const seoApiBaseUrl = resolveSeoApiBaseUrl(process.env.VITE_API_BASE_URL);

const createVoteSocialImageErrorResponse = (
    requestMethod: string,
): Response =>
    new Response(requestMethod === 'HEAD' ? null : 'Failed to render image.', {
        headers: {
            'cache-control': 'no-store, max-age=0',
            'content-type': 'text/plain; charset=utf-8',
        },
        status: 500,
    });

export const config = {
    path: '/social/votes/:slug.png',
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

    const pollSlug =
        context.params?.slug ||
        extractVoteSocialImageSlugFromPathname(new URL(request.url).pathname);

    if (!pollSlug) {
        return new Response(null, {
            status: 404,
        });
    }

    try {
        const voteSocialImageResponse = await createVoteSocialImageResponse({
            apiBaseUrl: seoApiBaseUrl,
            pollSlug,
            signal: AbortSignal.timeout(5000),
        });

        return new Response(
            request.method === 'HEAD'
                ? null
                : Buffer.from(voteSocialImageResponse.body),
            {
                headers: voteSocialImageResponse.headers,
                status: 200,
            },
        );
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Failed to render vote social image.',
        );

        return createVoteSocialImageErrorResponse(request.method);
    }
};
