import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

import sirv from 'sirv';

import { renderDocumentHtml, resolveSeoApiBaseUrl } from './documentSeo.ts';
import {
    assertBuiltDistExists,
    resolveServeDistOptions,
} from './serveDistConfig.ts';
import {
    createVoteSocialImageResponse,
    extractVoteSocialImageSlugFromPathname,
    extractVoteSocialImageVariantFromSearchParams,
} from './voteSocialImage.ts';

const readForwardedHeader = (
    value: string | string[] | undefined,
): string | null => {
    if (!value) {
        return null;
    }

    const normalizedValue = Array.isArray(value) ? value[0] : value;

    return normalizedValue?.split(',')[0]?.trim() || null;
};

const normalizeForwardedProtocol = (value: string | null): 'http' | 'https' => {
    if (value === 'https') {
        return 'https';
    }

    return 'http';
};

const trustedSeoPublicOrigin = (() => {
    const rawOrigin = process.env.SEO_PUBLIC_ORIGIN?.trim();

    if (!rawOrigin) {
        return null;
    }

    try {
        const parsedOrigin = new URL(rawOrigin);

        if (
            parsedOrigin.protocol !== 'http:' &&
            parsedOrigin.protocol !== 'https:'
        ) {
            return null;
        }

        return parsedOrigin.origin;
    } catch {
        return null;
    }
})();

const localSeoHostnames = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const isAllowedSeoHostname = (hostname: string): boolean =>
    localSeoHostnames.has(hostname) ||
    hostname === 'up.railway.app' ||
    hostname.endsWith('.up.railway.app');

const normalizeSeoRequestHost = (
    value: string | null | undefined,
): string | null => {
    const normalizedValue = value?.trim().toLowerCase() || null;

    if (!normalizedValue) {
        return null;
    }

    try {
        const parsedHost = new URL(`http://${normalizedValue}`);

        if (
            parsedHost.pathname !== '/' ||
            parsedHost.search ||
            parsedHost.hash ||
            parsedHost.username ||
            parsedHost.password
        ) {
            return null;
        }

        if (!isAllowedSeoHostname(parsedHost.hostname)) {
            return null;
        }

        return parsedHost.host.toLowerCase();
    } catch {
        return null;
    }
};

const resolveSeoRequestBaseUrl = ({
    fallbackHost,
    protocol,
    rawForwardedHostHeader,
    rawHostHeader,
}: {
    fallbackHost: string;
    protocol: 'http' | 'https';
    rawForwardedHostHeader: string | null;
    rawHostHeader: string | undefined;
}): string => {
    if (trustedSeoPublicOrigin) {
        return trustedSeoPublicOrigin;
    }

    const trustedHost =
        normalizeSeoRequestHost(rawForwardedHostHeader) ||
        normalizeSeoRequestHost(rawHostHeader);

    return `${protocol}://${trustedHost || fallbackHost}`;
};

const createSafeRequestUrl = ({
    fallbackHost,
    protocol,
    rawForwardedHostHeader,
    rawHostHeader,
    rawRequestUrl,
}: {
    fallbackHost: string;
    protocol: 'http' | 'https';
    rawForwardedHostHeader: string | null;
    rawHostHeader: string | undefined;
    rawRequestUrl: string | undefined;
}): URL => {
    const fallbackBaseUrl = resolveSeoRequestBaseUrl({
        fallbackHost,
        protocol,
        rawForwardedHostHeader,
        rawHostHeader,
    });

    try {
        return new URL(rawRequestUrl || '/', fallbackBaseUrl);
    } catch {
        try {
            return new URL('/', fallbackBaseUrl);
        } catch {
            return new URL('/', `${protocol}://${fallbackHost}`);
        }
    }
};

const start = async (): Promise<void> => {
    const { distDirectory, host, port } = resolveServeDistOptions(
        process.argv.slice(2),
    );

    await assertBuiltDistExists();
    const baseHtmlPath = path.resolve(distDirectory, 'index.html');
    const baseHtml = await fs.readFile(baseHtmlPath, 'utf8');
    const seoApiBaseUrl = resolveSeoApiBaseUrl(process.env.VITE_API_BASE_URL);

    const serveStatic = sirv(distDirectory, {
        dev: false,
        etag: true,
        single: 'index.html',
    });

    const server = http.createServer(async (request, response) => {
        const protocol = normalizeForwardedProtocol(
            readForwardedHeader(request.headers['x-forwarded-proto']),
        );
        const requestUrl = createSafeRequestUrl({
            fallbackHost: `${host}:${port}`,
            protocol,
            rawForwardedHostHeader: readForwardedHeader(
                request.headers['x-forwarded-host'],
            ),
            rawHostHeader: request.headers.host,
            rawRequestUrl: request.url,
        });
        const voteSocialImageSlug = extractVoteSocialImageSlugFromPathname(
            requestUrl.pathname,
        );
        const voteSocialImageVariant =
            extractVoteSocialImageVariantFromSearchParams(
                requestUrl.searchParams,
            );
        const isDocumentRequest =
            (request.method === 'GET' || request.method === 'HEAD') &&
            path.extname(requestUrl.pathname) === '';

        if (
            voteSocialImageSlug &&
            (request.method === 'GET' || request.method === 'HEAD')
        ) {
            try {
                const voteSocialImageResponse =
                    await createVoteSocialImageResponse({
                        apiBaseUrl: seoApiBaseUrl,
                        pollSlug: voteSocialImageSlug,
                        signal: AbortSignal.timeout(5000),
                        variant: voteSocialImageVariant,
                    });

                response.statusCode = voteSocialImageResponse.status;

                Object.entries(voteSocialImageResponse.headers).forEach(
                    ([headerName, headerValue]) => {
                        response.setHeader(headerName, headerValue);
                    },
                );

                response.end(
                    request.method === 'HEAD'
                        ? undefined
                        : voteSocialImageResponse.body,
                );
                return;
            } catch (error) {
                console.error(
                    error instanceof Error
                        ? error.message
                        : 'Failed to render vote social image.',
                );
            }
        }

        if (isDocumentRequest) {
            try {
                const html = await renderDocumentHtml({
                    apiBaseUrl: seoApiBaseUrl,
                    baseHtml,
                    requestUrl,
                    signal: AbortSignal.timeout(5000),
                });

                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(request.method === 'HEAD' ? undefined : html);
                return;
            } catch (error) {
                console.error(
                    error instanceof Error
                        ? error.message
                        : 'Failed to render SEO HTML.',
                );
            }
        }

        serveStatic(request, response);
    });

    server.on('error', (error) => {
        console.error(
            error instanceof Error
                ? error.message
                : 'Failed to start built web server.',
        );
        process.exit(1);
    });

    await new Promise<void>((resolve) => {
        server.listen(port, host, () => {
            console.info(
                `Serving built web app from ${distDirectory} on http://${host}:${port}.`,
            );
            resolve();
        });
    });
};

void start();
