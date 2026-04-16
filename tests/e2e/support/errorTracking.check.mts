import assert from 'node:assert/strict';
import test from 'node:test';

import {
    attachErrorTracking,
    createErrorTrackingAttacher,
    createUnexpectedErrorTracker,
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

const createMockPage = () => {
    const listeners = new Map<string, (value: unknown) => void>();

    return {
        listeners,
        page: {
            on: (eventName: string, listener: (value: unknown) => void) => {
                listeners.set(eventName, listener);
            },
            url: () => 'https://sealed.vote/votes/mock-poll',
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
        'console',
        'pageerror',
        'response',
    ]);
    assert.deepEqual([...replacementPage.listeners.keys()].sort(), [
        'console',
        'pageerror',
        'response',
    ]);
});
