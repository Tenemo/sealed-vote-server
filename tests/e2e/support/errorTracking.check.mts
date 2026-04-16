import assert from 'node:assert/strict';
import test from 'node:test';

import {
    attachErrorTracking,
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
    expectNoUnexpectedErrors,
} from './errorTracking.ts';

const createMockConsoleMessage = (
    text: string,
    options?: {
        location?: {
            columnNumber?: number;
            lineNumber?: number;
            url?: string;
        };
    },
) => ({
    location: () => options?.location ?? {},
    text: () => text,
    type: () => 'error',
});

const createMockResponse = ({
    bodyText,
    method = 'POST',
    status,
    url,
}: {
    bodyText: string;
    method?: string;
    status: number;
    url: string;
}) => ({
    request: () => ({
        method: () => method,
    }),
    status: () => status,
    text: async () => bodyText,
    url: () => url,
});

const createMockRequest = ({
    errorText,
    method = 'GET',
    resourceType = 'document',
    url,
}: {
    errorText: string;
    method?: string;
    resourceType?: string;
    url: string;
}) => ({
    failure: () => ({
        errorText,
    }),
    method: () => method,
    resourceType: () => resourceType,
    url: () => url,
});

const createMockPage = (
    state: {
        bodyText?: string;
        currentUrl?: string;
        readyState?: string;
        title?: string;
        visibilityState?: string;
    } = {},
) => {
    const listeners = new Map<string, (...values: unknown[]) => void>();
    const currentUrl = state.currentUrl ?? 'https://sealed.vote/votes/mock-poll';
    const mainFrame = {
        url: () => currentUrl,
    };

    return {
        listeners,
        page: {
            evaluate: async () => ({
                bodyText: state.bodyText ?? 'Create vote Mock poll body',
                locationHref: currentUrl,
                navigationEntry: {
                    domContentLoadedEventEnd: 80,
                    duration: 125,
                    loadEventEnd: 110,
                    responseEnd: 45,
                    type: 'navigate',
                },
                readyState: state.readyState ?? 'complete',
                title: state.title ?? 'Mock vote page',
                visibilityState: state.visibilityState ?? 'visible',
            }),
            isClosed: () => false,
            mainFrame: () => mainFrame,
            on: (
                eventName: string,
                listener: (...values: unknown[]) => void,
            ) => {
                listeners.set(eventName, listener);
            },
            url: () => currentUrl,
        },
    };
};

test('attachErrorTracking treats global allowed console regexes as stateless', () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker, {
        allowedConsoleErrors: [/Failed to load resource/gu],
    });

    const consoleListener = listeners.get('console');
    assert.ok(consoleListener);

    consoleListener(
        createMockConsoleMessage(
            'Failed to load resource: the server responded with a status of 409',
        ),
    );
    consoleListener(
        createMockConsoleMessage(
            'Failed to load resource: the server responded with a status of 409',
        ),
    );

    assert.deepEqual(tracker.errors, []);
});

test('attachErrorTracking still records disallowed console errors', () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker);

    const consoleListener = listeners.get('console');
    assert.ok(consoleListener);

    consoleListener(createMockConsoleMessage('Unexpected console failure'));

    assert.deepEqual(tracker.errors, [
        '[page] console (page https://sealed.vote/votes/mock-poll): Unexpected console failure',
    ]);
});

test('attachErrorTracking records console source locations when available', () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker);

    const consoleListener = listeners.get('console');
    assert.ok(consoleListener);

    consoleListener(
        createMockConsoleMessage('Chunk load failed', {
            location: {
                columnNumber: 9,
                lineNumber: 42,
                url: 'https://sealed.vote/assets/index.js',
            },
        }),
    );

    assert.deepEqual(tracker.errors, [
        '[page] console at https://sealed.vote/assets/index.js:42:9 (page https://sealed.vote/votes/mock-poll): Chunk load failed',
    ]);
});

test('attachErrorTracking records response method, page url, and API message', async () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker);

    const responseListener = listeners.get('response');
    assert.ok(responseListener);

    responseListener(
        createMockResponse({
            bodyText: JSON.stringify({
                message:
                    'The submitted payload does not match the active ceremony session.',
            }),
            status: 409,
            url: 'https://api.sealed.vote/api/board/messages',
        }),
    );

    await Promise.allSettled([...tracker.pendingChecks]);

    assert.deepEqual(tracker.errors, [
        '[page] response: POST 409 https://api.sealed.vote/api/board/messages (page https://sealed.vote/votes/mock-poll) message=The submitted payload does not match the active ceremony session.',
    ]);
});

test('attachErrorTracking records page errors with page url and stack', () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker);

    const pageErrorListener = listeners.get('pageerror');
    assert.ok(pageErrorListener);

    const error = new Error('Unexpected render failure');
    error.stack = 'Error: Unexpected render failure\n    at Poll (Poll.tsx:42:9)';

    pageErrorListener(error);

    assert.deepEqual(tracker.errors, [
        '[page] pageerror (page https://sealed.vote/votes/mock-poll): Unexpected render failure stack=Error: Unexpected render failure at Poll (Poll.tsx:42:9)',
    ]);
});

test('attachErrorTracking records tracked request failures as recent activity', () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage();

    attachErrorTracking(page as never, 'page', tracker);

    const requestFailedListener = listeners.get('requestfailed');
    assert.ok(requestFailedListener);

    requestFailedListener(
        createMockRequest({
            errorText: 'net::ERR_CONNECTION_RESET',
            url: 'https://sealed.vote/votes/mock-poll',
        }),
    );

    assert.deepEqual(tracker.errors, []);
    assert.deepEqual(tracker.recentEvents, [
        '[page] requestfailed: GET https://sealed.vote/votes/mock-poll resource=document (page https://sealed.vote/votes/mock-poll) failure=net::ERR_CONNECTION_RESET',
    ]);
});

test('expectNoUnexpectedErrors includes recent activity and tracked page snapshots', async () => {
    const tracker = createUnexpectedErrorTracker();
    const { listeners, page } = createMockPage({
        bodyText: 'Create vote Mock poll body',
        readyState: 'interactive',
        title: 'Mock vote page',
    });

    attachErrorTracking(page as never, 'page', tracker);

    const loadListener = listeners.get('load');
    const consoleListener = listeners.get('console');
    assert.ok(loadListener);
    assert.ok(consoleListener);

    loadListener();
    consoleListener(createMockConsoleMessage('Unexpected console failure'));

    await assert.rejects(async () => await expectNoUnexpectedErrors(tracker), (error) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Unexpected browser errors detected:/u);
        assert.match(error.message, /Recent page activity:/u);
        assert.match(
            error.message,
            /\[page\] load \(page https:\/\/sealed\.vote\/votes\/mock-poll\)/u,
        );
        assert.match(error.message, /Tracked page snapshots:/u);
        assert.match(error.message, /readyState=interactive/u);
        assert.match(error.message, /title="Mock vote page"/u);
        assert.match(
            error.message,
            /body="Create vote Mock poll body"/u,
        );

        return true;
    });
});

test('createErrorTrackingAttacher avoids duplicate listeners on the same page and attaches to replacements', () => {
    const tracker = createUnexpectedErrorTracker();
    const firstPage = createMockPage();
    const replacementPage = createMockPage();
    const attachPageTracking = createErrorTrackingAttacher({
        label: 'page',
        tracker,
    });

    attachPageTracking(firstPage.page as never);
    attachPageTracking(firstPage.page as never);
    attachPageTracking(replacementPage.page as never);

    assert.deepEqual([...firstPage.listeners.keys()].sort(), [
        'close',
        'console',
        'domcontentloaded',
        'framenavigated',
        'load',
        'pageerror',
        'requestfailed',
        'response',
    ]);
    assert.deepEqual([...replacementPage.listeners.keys()].sort(), [
        'close',
        'console',
        'domcontentloaded',
        'framenavigated',
        'load',
        'pageerror',
        'requestfailed',
        'response',
    ]);
});
