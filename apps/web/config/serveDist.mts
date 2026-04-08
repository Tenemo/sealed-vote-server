import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

import sirv from 'sirv';

import { renderDocumentHtml, resolveSeoApiBaseUrl } from './documentSeo.ts';
import {
    assertBuiltDistExists,
    resolveServeDistOptions,
} from './serveDistConfig.ts';

const readForwardedHeader = (
    value: string | string[] | undefined,
): string | null => {
    if (!value) {
        return null;
    }

    const normalizedValue = Array.isArray(value) ? value[0] : value;

    return normalizedValue?.split(',')[0]?.trim() || null;
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
        const protocol =
            readForwardedHeader(request.headers['x-forwarded-proto']) || 'http';
        const requestUrl = new URL(
            request.url || '/',
            `${protocol}://${request.headers.host || `${host}:${port}`}`,
        );
        const isDocumentRequest =
            (request.method === 'GET' || request.method === 'HEAD') &&
            path.extname(requestUrl.pathname) === '';

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
