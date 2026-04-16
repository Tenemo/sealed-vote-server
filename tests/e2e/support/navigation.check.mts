import assert from 'node:assert/strict';
import test from 'node:test';

import {
    gotoInteractablePage,
    reloadInteractablePage,
    resolveNavigationTimeoutMs,
    type NavigationTarget,
} from './navigation.mts';

type NavigationOptions = {
    referer?: string;
    timeout?: number;
    waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle';
};

type NavigationUrlMatcher = string | RegExp | ((url: URL) => boolean);
type PageDoubleState = {
    currentUrl: string;
    isInteractable: boolean;
};

const createWaitForUrlTimeoutError = (timeout: number): Error =>
    new Error(`page.waitForURL: Timeout ${timeout}ms exceeded.`);

const doesMatcherMatch = (
    matcher: NavigationUrlMatcher,
    currentUrl: string,
): boolean => {
    if (typeof matcher === 'function') {
        return matcher(new URL(currentUrl));
    }

    if (matcher instanceof RegExp) {
        return matcher.test(currentUrl);
    }

    return currentUrl === matcher;
};

const createPageDouble = (
    state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: true,
    },
): NavigationTarget => ({
    goto: async () => undefined,
    reload: async () => undefined,
    url: () => state.currentUrl,
    waitForTimeout: async () => undefined,
    waitForURL: async (
        matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        const timeout = options?.timeout ?? 0;

        if (
            !state.isInteractable ||
            !doesMatcherMatch(matcher, state.currentUrl)
        ) {
            throw createWaitForUrlTimeoutError(timeout);
        }
    },
});

// These helper checks look a bit unusual because they test Playwright plumbing
// rather than the app directly, but they pin the retry and recovery behavior
// that keeps the browser matrix stable across transient navigation failures.
test('gotoInteractablePage waits for commit with a short timeout', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble();
    page.goto = async (_url: string, options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    await gotoInteractablePage(page, 'https://sealed.vote/votes/example--1234');

    assert.deepEqual(calls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage allows an explicit navigation-timeout override', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble();
    const previousTimeout = process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;

    page.goto = async (_url: string, options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';

    try {
        await gotoInteractablePage(
            page,
            'https://sealed.vote/votes/example--1234',
        );
    } finally {
        if (previousTimeout === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = previousTimeout;
        }
    }

    assert.deepEqual(calls, [
        {
            timeout: 45_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage retries transient Firefox navigation errors once', async () => {
    const gotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    let callCount = 0;
    const page = createPageDouble({
        currentUrl: 'about:blank',
        isInteractable: false,
    });

    page.goto = async (_url: string, options?: NavigationOptions) => {
        gotoCalls.push(options as NavigationOptions);
        callCount += 1;

        if (callCount === 1) {
            throw new Error('page.goto: NS_ERROR_NET_TIMEOUT');
        }
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    await gotoInteractablePage(page, '/');

    assert.equal(callCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(gotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage accepts a recovered target without a second navigate', async () => {
    const retryDelays: number[] = [];
    const recoveryWaits: NavigationOptions[] = [];
    const state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
    };
    const page = createPageDouble(state);
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;

    page.goto = async () => {
        callCount += 1;
        state.currentUrl = 'https://sealed.vote/votes/example--1234';
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async (
        matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        recoveryWaits.push(options as NavigationOptions);
        state.isInteractable = true;
        assert.equal(
            doesMatcherMatch(matcher, 'https://sealed.vote/votes/example--1234'),
            true,
        );
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';
    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        await gotoInteractablePage(
            page,
            'https://sealed.vote/votes/example--1234',
        );
    } finally {
        if (previousNavigationTimeout === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS =
                previousNavigationTimeout;
        }

        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(callCount, 1);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(recoveryWaits, [
        {
            timeout: 10_000,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('gotoInteractablePage can retry transient timeout stalls when enabled', async () => {
    const gotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;
    const page = createPageDouble({
        currentUrl: 'about:blank',
        isInteractable: false,
    });

    page.goto = async (_url: string, options?: NavigationOptions) => {
        gotoCalls.push(options as NavigationOptions);
        callCount += 1;

        if (callCount === 1) {
            throw new Error('page.goto: Timeout 45000ms exceeded.');
        }
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        await gotoInteractablePage(page, '/');
    } finally {
        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(callCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(gotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage still retries when a transient abort lands on the wrong page', async () => {
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'https://sealed.vote/unexpected',
        isInteractable: true,
    };
    let callCount = 0;
    const page = createPageDouble(state);

    page.goto = async () => {
        callCount += 1;

        if (callCount === 1) {
            throw new Error('page.goto: NS_BINDING_ABORTED');
        }
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    await gotoInteractablePage(page, '/');

    assert.equal(callCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
});

test('gotoInteractablePage does not retry non-transient navigation errors', async () => {
    const page = createPageDouble();
    let callCount = 0;

    page.goto = async () => {
        callCount += 1;
        throw new Error('page.goto: net::ERR_CONNECTION_REFUSED');
    };

    await assert.rejects(
        async () => await gotoInteractablePage(page, '/'),
        /ERR_CONNECTION_REFUSED/u,
    );
    assert.equal(callCount, 1);
});

test('reloadInteractablePage uses the same navigation policy', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble({
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: true,
    });
    page.reload = async (options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    await reloadInteractablePage(page);

    assert.deepEqual(calls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('reloadInteractablePage accepts a recovered page without a second reload', async () => {
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: false,
    };
    const page = createPageDouble(state);
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;

    page.reload = async () => {
        callCount += 1;
        state.isInteractable = true;
        throw new Error('page.reload: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        await reloadInteractablePage(page);
    } finally {
        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(callCount, 1);
    assert.deepEqual(retryDelays, [1_000]);
});

test('resolveNavigationTimeoutMs rejects invalid overrides', () => {
    assert.throws(
        () => resolveNavigationTimeoutMs('not-a-number'),
        /PLAYWRIGHT_NAVIGATION_TIMEOUT_MS must be a positive integer./u,
    );
    assert.throws(
        () => resolveNavigationTimeoutMs('0'),
        /PLAYWRIGHT_NAVIGATION_TIMEOUT_MS must be a positive integer./u,
    );
});
