import http from 'node:http';

import sirv from 'sirv';

import {
    assertBuiltDistExists,
    resolveServeDistOptions,
} from './serveDistConfig.ts';

const start = async (): Promise<void> => {
    const { distDirectory, host, port } = resolveServeDistOptions(
        process.argv.slice(2),
    );

    await assertBuiltDistExists();

    const serveStatic = sirv(distDirectory, {
        dev: false,
        etag: true,
        single: 'index.html',
    });

    const server = http.createServer((request, response) => {
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
