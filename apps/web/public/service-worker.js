/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* global caches, self */

const appShellCacheName = 'sealed-vote-app-shell-v1';
const pollCacheName = 'sealed-vote-polls-v1';
const staticAssetCacheName = 'sealed-vote-static-v1';

const appShellUrls = [
    '/',
    '/index.html',
    '/favicon/favicon-96x96.png',
    '/favicon/favicon.svg',
    '/favicon/favicon.ico',
    '/favicon/apple-touch-icon.png',
    '/favicon/site.webmanifest',
];

const isSuccessfulResponse = (response) =>
    Boolean(response && response.ok && response.type !== 'opaque');

const isSameOrigin = (url) => url.origin === self.location.origin;

const isPollGetRequest = (requestUrl) =>
    /^\/api\/polls\/[^/]+$/.test(requestUrl.pathname);

const isCacheableStaticRequest = (request) =>
    ['document', 'font', 'image', 'script', 'style'].includes(
        request.destination,
    );

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(appShellCacheName)
            .then((cache) => cache.addAll(appShellUrls)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter(
                            (cacheName) =>
                                ![
                                    appShellCacheName,
                                    pollCacheName,
                                    staticAssetCacheName,
                                ].includes(cacheName),
                        )
                        .map((cacheName) => caches.delete(cacheName)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);

    if (!isSameOrigin(requestUrl) || request.method !== 'GET') {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (isSuccessfulResponse(response)) {
                        const responseClone = response.clone();
                        void caches
                            .open(appShellCacheName)
                            .then((cache) =>
                                cache.put('/index.html', responseClone),
                            );
                    }

                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(appShellCacheName);
                    return (
                        (await cache.match(request)) ??
                        (await cache.match('/index.html'))
                    );
                }),
        );
        return;
    }

    if (isPollGetRequest(requestUrl)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (isSuccessfulResponse(response)) {
                        const responseClone = response.clone();
                        void caches
                            .open(pollCacheName)
                            .then((cache) => cache.put(request, responseClone));
                    }

                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(pollCacheName);
                    return await cache.match(request);
                }),
        );
        return;
    }

    if (!isCacheableStaticRequest(request)) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then((response) => {
                if (isSuccessfulResponse(response)) {
                    const responseClone = response.clone();
                    void caches
                        .open(staticAssetCacheName)
                        .then((cache) => cache.put(request, responseClone));
                }

                return response;
            });
        }),
    );
});
