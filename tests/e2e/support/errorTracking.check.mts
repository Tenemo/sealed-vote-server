import assert from 'node:assert/strict';
import test from 'node:test';

import {
    attachErrorTracking,
    createUnexpectedErrorTracker,
} from './errorTracking.ts';

const createMockConsoleMessage = (text: string) => ({
    text: () => text,
    type: () => 'error',
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

    attachErrorTracking(
        page as never,
        'page',
        tracker,
        {
            allowedConsoleErrors: [/Failed to load resource/gu],
        },
    );

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
        '[page] console: Unexpected console failure',
    ]);
});
