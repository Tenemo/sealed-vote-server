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
    documentTitle?: string;
    htmlContent?: string;
    isInteractable: boolean;
    readyState: 'complete' | 'interactive' | 'loading';
    viewportSize?: {
        height: number;
        width: number;
    } | null;
};
type PageDouble = NavigationTarget & {
    close: () => Promise<void>;
    context: () => {
        newPage: () => Promise<PageDouble>;
    };
    isClosed: () => boolean;
};

const blankPlaceholderHtml = '<html><head></head><body></body></html>';
const readyPageHtml = '<html><body><main>Ready</main></body></html>';

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
        readyState: 'complete',
        viewportSize: null,
    },
    options: {
        createReplacement?: () => Promise<PageDouble> | PageDouble;
    } = {},
): PageDouble => {
    let isClosed = false;

    return {
        close: async () => {
            isClosed = true;
        },
        content: async () =>
            state.htmlContent ??
            (state.isInteractable ? readyPageHtml : blankPlaceholderHtml),
        context: () => ({
            newPage: async () => {
                const replacement = options.createReplacement;

                if (!replacement) {
                    throw new Error(
                        'Replacement page requested unexpectedly.',
                    );
                }

                return await replacement();
            },
        }),
        goto: async () => undefined,
        evaluate: async <Result,>() => state.readyState as unknown as Result,
        isClosed: () => isClosed,
        reload: async () => undefined,
        setViewportSize: async (viewportSize) => {
            state.viewportSize = viewportSize;
        },
        title: async () =>
            state.documentTitle ?? (state.isInteractable ? 'Ready' : ''),
        url: () => state.currentUrl,
        viewportSize: () => state.viewportSize ?? null,
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
    };
};

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

test('gotoInteractablePage replaces the page after a transient Firefox navigation error', async () => {
    const originalGotoCalls: NavigationOptions[] = [];
    const replacementGotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    const replacementPage = createPageDouble();
    replacementPage.goto = async (_url: string, options?: NavigationOptions) => {
        replacementGotoCalls.push(options as NavigationOptions);
    };

    const page = createPageDouble(
        {
            currentUrl: 'about:blank',
            isInteractable: false,
            readyState: 'loading',
        },
        {
            createReplacement: () => replacementPage,
        },
    );

    page.goto = async (_url: string, options?: NavigationOptions) => {
        originalGotoCalls.push(options as NavigationOptions);
        throw new Error('page.goto: NS_ERROR_NET_TIMEOUT');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    const resolvedPage = await gotoInteractablePage(page, '/');

    assert.equal(resolvedPage, replacementPage);
    assert.equal(page.isClosed(), true);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(originalGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
    assert.deepEqual(replacementGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage preserves the viewport on a replacement page', async () => {
    const replacementState: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: true,
        readyState: 'complete',
        viewportSize: null,
    };
    const replacementPage = createPageDouble(replacementState);
    const page = createPageDouble(
        {
            currentUrl: 'about:blank',
            isInteractable: false,
            readyState: 'loading',
            viewportSize: {
                height: 640,
                width: 320,
            },
        },
        {
            createReplacement: () => replacementPage,
        },
    );

    page.goto = async () => {
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await gotoInteractablePage(page, '/');

        assert.equal(resolvedPage, replacementPage);
    } finally {
        delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    }

    assert.deepEqual(replacementState.viewportSize, {
        height: 640,
        width: 320,
    });
});

test('gotoInteractablePage accepts a recovered target without a second navigate', async () => {
    const retryDelays: number[] = [];
    const recoveryWaits: NavigationOptions[] = [];
    const state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
        readyState: 'loading',
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
        state.readyState = 'complete';
        assert.equal(
            doesMatcherMatch(
                matcher,
                'https://sealed.vote/votes/example--1234',
            ),
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

test('gotoInteractablePage replaces the page after a transient timeout stall when enabled', async () => {
    const originalGotoCalls: NavigationOptions[] = [];
    const replacementGotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    const replacementPage = createPageDouble();
    const page = createPageDouble(
        {
            currentUrl: 'about:blank',
            isInteractable: false,
            readyState: 'loading',
        },
        {
            createReplacement: () => replacementPage,
        },
    );

    replacementPage.goto = async (
        _url: string,
        options?: NavigationOptions,
    ) => {
        replacementGotoCalls.push(options as NavigationOptions);
    };

    page.goto = async (_url: string, options?: NavigationOptions) => {
        originalGotoCalls.push(options as NavigationOptions);
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await gotoInteractablePage(page, '/');

        assert.equal(resolvedPage, replacementPage);
    } finally {
        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(page.isClosed(), true);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(originalGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
    assert.deepEqual(replacementGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage replaces a blank off-target stall without waiting for recovery probes', async () => {
    const recoveryWaits: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    const replacementGotoCalls: NavigationOptions[] = [];
    const replacementPage = createPageDouble();
    const pageState: PageDoubleState = {
        currentUrl: 'about:blank',
        htmlContent: blankPlaceholderHtml,
        isInteractable: false,
        readyState: 'complete',
    };
    const page = createPageDouble(pageState, {
        createReplacement: () => replacementPage,
    });
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;

    page.goto = async () => {
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async (
        _matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        recoveryWaits.push(options as NavigationOptions);
        throw createWaitForUrlTimeoutError(options?.timeout ?? 0);
    };
    replacementPage.goto = async (
        _url: string,
        options?: NavigationOptions,
    ) => {
        replacementGotoCalls.push(options as NavigationOptions);
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';
    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await gotoInteractablePage(
            page,
            'https://sealed.vote/votes/example--1234',
        );

        assert.equal(resolvedPage, replacementPage);
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

    assert.equal(page.isClosed(), true);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(recoveryWaits, []);
    assert.deepEqual(replacementGotoCalls, [
        {
            timeout: 45_000,
            waitUntil: 'commit',
        },
    ]);
});

test('gotoInteractablePage replaces the page when a transient abort lands on the wrong page', async () => {
    const replacementGotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'https://sealed.vote/unexpected',
        isInteractable: true,
        readyState: 'complete',
    };
    const replacementPage = createPageDouble();
    const page = createPageDouble(state, {
        createReplacement: () => replacementPage,
    });

    replacementPage.goto = async (
        _url: string,
        options?: NavigationOptions,
    ) => {
        replacementGotoCalls.push(options as NavigationOptions);
    };

    page.goto = async () => {
        throw new Error('page.goto: NS_BINDING_ABORTED');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    const resolvedPage = await gotoInteractablePage(page, '/');

    assert.equal(resolvedPage, replacementPage);
    assert.equal(page.isClosed(), true);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(replacementGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
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

test('gotoInteractablePage accepts a page that already loaded after the timeout', async () => {
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
        readyState: 'loading',
    };
    const page = createPageDouble(state);
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;
    let recoveryProbeCount = 0;

    page.goto = async () => {
        callCount += 1;
        state.currentUrl = 'https://sealed.vote/votes/example--1234';
        state.isInteractable = true;
        state.readyState = 'complete';
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async () => {
        recoveryProbeCount += 1;
        throw createWaitForUrlTimeoutError(10_000);
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
    assert.equal(recoveryProbeCount, 0);
    assert.deepEqual(retryDelays, [1_000]);
});

test('gotoInteractablePage accepts a page that becomes ready after the recovery probe times out', async () => {
    const retryDelays: number[] = [];
    const recoveryWaits: NavigationOptions[] = [];
    const state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
        readyState: 'loading',
    };
    const page = createPageDouble(state);
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;
    let recoveryProbeCount = 0;

    page.goto = async () => {
        callCount += 1;
        state.currentUrl = 'https://sealed.vote/votes/example--1234';
        state.htmlContent = blankPlaceholderHtml;
        state.readyState = 'complete';
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async (
        _matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        recoveryWaits.push(options as NavigationOptions);
        recoveryProbeCount += 1;

        if (recoveryProbeCount === 1) {
            throw createWaitForUrlTimeoutError(10_000);
        }

        state.isInteractable = true;
        state.htmlContent = readyPageHtml;
        state.readyState = 'complete';
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
    assert.equal(recoveryProbeCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(recoveryWaits, [
        {
            timeout: 10_000,
            waitUntil: 'domcontentloaded',
        },
        {
            timeout: 22_500,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('gotoInteractablePage accepts a replacement page that becomes ready after the recovery probe times out', async () => {
    const originalRetryDelays: number[] = [];
    const replacementRetryDelays: number[] = [];
    const replacementRecoveryWaits: NavigationOptions[] = [];
    const replacementState: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
        readyState: 'loading',
        viewportSize: null,
    };
    const replacementPage = createPageDouble(replacementState);
    const page = createPageDouble(
        {
            currentUrl: 'about:blank',
            isInteractable: false,
            readyState: 'loading',
        },
        {
            createReplacement: () => replacementPage,
        },
    );
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let replacementRecoveryProbeCount = 0;

    page.goto = async () => {
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        originalRetryDelays.push(timeout);
    };
    replacementPage.goto = async () => {
        replacementState.currentUrl = 'https://sealed.vote/';
        replacementState.htmlContent = blankPlaceholderHtml;
        replacementState.readyState = 'complete';
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    replacementPage.waitForTimeout = async (timeout: number) => {
        replacementRetryDelays.push(timeout);
    };
    replacementPage.waitForURL = async (
        _matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        replacementRecoveryWaits.push(options as NavigationOptions);
        replacementRecoveryProbeCount += 1;

        if (replacementRecoveryProbeCount === 1) {
            throw createWaitForUrlTimeoutError(10_000);
        }

        replacementState.isInteractable = true;
        replacementState.htmlContent = readyPageHtml;
        replacementState.readyState = 'complete';
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';
    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await gotoInteractablePage(page, '/');

        assert.equal(resolvedPage, replacementPage);
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

    assert.equal(page.isClosed(), true);
    assert.equal(replacementRecoveryProbeCount, 2);
    assert.deepEqual(originalRetryDelays, [1_000]);
    assert.deepEqual(replacementRetryDelays, [1_000]);
    assert.deepEqual(replacementRecoveryWaits, [
        {
            timeout: 10_000,
            waitUntil: 'domcontentloaded',
        },
        {
            timeout: 22_500,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('gotoInteractablePage recovers when page.goto never returns but the page finishes loading', async () => {
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'about:blank',
        isInteractable: false,
        readyState: 'loading',
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
        state.documentTitle = 'Vote | sealed.vote';
        state.htmlContent = readyPageHtml;
        state.isInteractable = true;
        state.readyState = 'complete';
        await new Promise(() => undefined);
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '50';
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
});

test('gotoInteractablePage appends page diagnostics when recovery is exhausted', async () => {
    const replacementState: PageDoubleState = {
        currentUrl: 'https://sealed.vote/votes/example--1234',
        documentTitle: 'Sealed vote',
        htmlContent:
            '<main><h1>Vote name</h1><button>Create vote</button></main>',
        isInteractable: false,
        readyState: 'loading',
    };
    const replacementPage = createPageDouble(replacementState);
    const page = createPageDouble(
        {
            currentUrl: 'about:blank',
            isInteractable: false,
            readyState: 'loading',
        },
        {
            createReplacement: () => replacementPage,
        },
    );
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;

    page.goto = async () => {
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    replacementPage.goto = async () => {
        throw new Error('page.goto: Timeout 45000ms exceeded.');
    };
    replacementPage.waitForURL = async (
        _matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        throw createWaitForUrlTimeoutError(options?.timeout ?? 0);
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';
    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        await assert.rejects(
            async () =>
                await gotoInteractablePage(
                    page,
                    'https://sealed.vote/votes/example--1234',
                ),
            (error) => {
                assert.ok(error instanceof Error);
                assert.match(error.message, /navigation diagnostics:/u);
                assert.match(
                    error.message,
                    /currentUrl=https:\/\/sealed\.vote\/votes\/example--1234/u,
                );
                assert.match(
                    error.message,
                    /expectedUrl=https:\/\/sealed\.vote\/votes\/example--1234/u,
                );
                assert.match(error.message, /matchesExpected=true/u);
                assert.match(error.message, /readyState=loading/u);
                assert.match(error.message, /title="Sealed vote"/u);
                assert.match(
                    error.message,
                    /content="Vote name Create vote"/u,
                );

                return true;
            },
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
});

test('reloadInteractablePage uses the same navigation policy', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble({
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: true,
        readyState: 'complete',
    });
    page.reload = async (options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    const resolvedPage = await reloadInteractablePage(page);

    assert.equal(resolvedPage, page);
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
        readyState: 'loading',
    };
    const page = createPageDouble(state);
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;

    page.reload = async () => {
        callCount += 1;
        state.isInteractable = true;
        state.readyState = 'complete';
        throw new Error('page.reload: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await reloadInteractablePage(page);

        assert.equal(resolvedPage, page);
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

test('reloadInteractablePage accepts a page that already reloaded after the timeout', async () => {
    const retryDelays: number[] = [];
    const state: PageDoubleState = {
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: false,
        readyState: 'loading',
    };
    const page = createPageDouble(state);
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;
    let recoveryProbeCount = 0;

    page.reload = async () => {
        callCount += 1;
        state.isInteractable = true;
        state.readyState = 'complete';
        throw new Error('page.reload: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async () => {
        recoveryProbeCount += 1;
        throw createWaitForUrlTimeoutError(3_750);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await reloadInteractablePage(page);

        assert.equal(resolvedPage, page);
    } finally {
        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(callCount, 1);
    assert.equal(recoveryProbeCount, 0);
    assert.deepEqual(retryDelays, [1_000]);
});

test('reloadInteractablePage accepts a page that becomes ready after the recovery probe times out', async () => {
    const retryDelays: number[] = [];
    const recoveryWaits: NavigationOptions[] = [];
    const state: PageDoubleState = {
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: false,
        readyState: 'loading',
    };
    const page = createPageDouble(state);
    const previousNavigationTimeout =
        process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS;
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    let callCount = 0;
    let recoveryProbeCount = 0;

    page.reload = async () => {
        callCount += 1;
        state.htmlContent = blankPlaceholderHtml;
        state.readyState = 'complete';
        throw new Error('page.reload: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    page.waitForURL = async (
        _matcher: NavigationUrlMatcher,
        options?: NavigationOptions,
    ) => {
        recoveryWaits.push(options as NavigationOptions);
        recoveryProbeCount += 1;

        if (recoveryProbeCount === 1) {
            throw createWaitForUrlTimeoutError(10_000);
        }

        state.isInteractable = true;
        state.htmlContent = readyPageHtml;
        state.readyState = 'complete';
    };

    process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS = '45000';
    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await reloadInteractablePage(page);

        assert.equal(resolvedPage, page);
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
    assert.equal(recoveryProbeCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(recoveryWaits, [
        {
            timeout: 10_000,
            waitUntil: 'domcontentloaded',
        },
        {
            timeout: 22_500,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('reloadInteractablePage replaces the page after a transient reload timeout', async () => {
    const retryDelays: number[] = [];
    const replacementGotoCalls: NavigationOptions[] = [];
    const previousRetrySetting =
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
    const replacementPage = createPageDouble({
        currentUrl: 'https://sealed.vote/votes/example--1234',
        isInteractable: true,
        readyState: 'complete',
    });
    const page = createPageDouble(
        {
            currentUrl: 'https://sealed.vote/votes/example--1234',
            isInteractable: false,
            readyState: 'loading',
        },
        {
            createReplacement: () => replacementPage,
        },
    );

    page.reload = async () => {
        throw new Error('page.reload: Timeout 45000ms exceeded.');
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };
    replacementPage.goto = async (
        _url: string,
        options?: NavigationOptions,
    ) => {
        replacementGotoCalls.push(options as NavigationOptions);
    };

    process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';

    try {
        const resolvedPage = await reloadInteractablePage(page);

        assert.equal(resolvedPage, replacementPage);
    } finally {
        if (previousRetrySetting === undefined) {
            delete process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS;
        } else {
            process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS =
                previousRetrySetting;
        }
    }

    assert.equal(page.isClosed(), true);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(replacementGotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'commit',
        },
    ]);
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
