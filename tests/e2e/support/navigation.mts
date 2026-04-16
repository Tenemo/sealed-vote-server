type NavigationWaitUntil =
    | 'commit'
    | 'domcontentloaded'
    | 'load'
    | 'networkidle';

type NavigationGotoOptions = {
    referer?: string;
    timeout?: number;
    waitUntil?: NavigationWaitUntil;
};

type NavigationCloseOptions = {
    runBeforeUnload?: boolean;
};

type NavigationReloadOptions = Omit<NavigationGotoOptions, 'referer'>;
type NavigationWaitForUrlOptions = Omit<NavigationGotoOptions, 'referer'>;
type NavigationUrlMatcher = string | RegExp | ((url: URL) => boolean);

export type NavigationTarget = {
    goto: (url: string, options?: NavigationGotoOptions) => Promise<unknown>;
    reload: (options?: NavigationReloadOptions) => Promise<unknown>;
    url: () => string;
    evaluate: <Result>(
        pageFunction: () => Result | Promise<Result>,
    ) => Promise<Result>;
    close?: (options?: NavigationCloseOptions) => Promise<void>;
    context?: () => {
        newPage: () => Promise<NavigationTarget>;
    };
    isClosed?: () => boolean;
    waitForTimeout: (timeout: number) => Promise<void>;
    waitForURL: (
        url: NavigationUrlMatcher,
        options?: NavigationWaitForUrlOptions,
    ) => Promise<unknown>;
};

// Production artifacts showed pages rendering successfully while Playwright was
// still waiting for a stricter navigation milestone. Keep generic navigation at
// the first committed response, then let each caller wait for the specific UI it
// needs before interacting.
const navigationReadyState = 'commit' as const;
const recoveryReadyState = 'domcontentloaded' as const;
const defaultNavigationTimeoutMs = 15_000;
const navigationRetryDelayMs = 1_000;
const transientNavigationErrorPatterns = [
    /ERR_ABORTED/u,
    /NS_BINDING_ABORTED/u,
    /NS_ERROR_ABORT/u,
    /NS_ERROR_NET_TIMEOUT/u,
] as const;
const transientNavigationTimeoutPattern = /Timeout \d+ms exceeded/u;
const relativeUrlBase = 'https://playwright-navigation-check.invalid';

export const resolveNavigationTimeoutMs = (
    rawTimeout = process.env.PLAYWRIGHT_NAVIGATION_TIMEOUT_MS,
): number => {
    const normalizedTimeout = rawTimeout?.trim();

    if (!normalizedTimeout) {
        return defaultNavigationTimeoutMs;
    }

    const parsedTimeout = Number(normalizedTimeout);

    if (
        !Number.isFinite(parsedTimeout) ||
        !Number.isInteger(parsedTimeout) ||
        parsedTimeout < 1
    ) {
        throw new Error(
            'PLAYWRIGHT_NAVIGATION_TIMEOUT_MS must be a positive integer.',
        );
    }

    return parsedTimeout;
};

const shouldRetryNavigationTimeouts = (
    rawValue = process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS,
): boolean => rawValue?.trim().toLowerCase() === 'true';

const isTransientNavigationError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    if (
        transientNavigationErrorPatterns.some((pattern) =>
            pattern.test(error.message),
        )
    ) {
        return true;
    }

    return (
        shouldRetryNavigationTimeouts() &&
        transientNavigationTimeoutPattern.test(error.message)
    );
};

const tryParseUrl = (value: string, base?: string): URL | null => {
    try {
        return base ? new URL(value, base) : new URL(value);
    } catch {
        return null;
    }
};

const formatComparableAbsoluteUrl = (url: URL): string =>
    `${url.origin}${url.pathname}${url.search}${url.hash}`;

const formatComparableRelativeUrl = (url: URL): string =>
    `${url.pathname}${url.search}${url.hash}`;

const resolveNavigationRecoveryTimeoutMs = (
    navigationTimeoutMs: number,
): number =>
    Math.min(10_000, Math.max(2_000, Math.floor(navigationTimeoutMs / 4)));

const doesPageMatchTargetUrl = (
    currentPageUrl: string,
    targetUrl: string,
): boolean => {
    const parsedCurrentPageUrl = tryParseUrl(currentPageUrl);

    if (!parsedCurrentPageUrl) {
        return false;
    }

    const parsedAbsoluteTargetUrl = tryParseUrl(targetUrl);

    if (parsedAbsoluteTargetUrl) {
        return (
            formatComparableAbsoluteUrl(parsedCurrentPageUrl) ===
            formatComparableAbsoluteUrl(parsedAbsoluteTargetUrl)
        );
    }

    const parsedRelativeTargetUrl = tryParseUrl(targetUrl, relativeUrlBase);

    if (!parsedRelativeTargetUrl) {
        return false;
    }

    return (
        formatComparableRelativeUrl(parsedCurrentPageUrl) ===
        formatComparableRelativeUrl(parsedRelativeTargetUrl)
    );
};

const isTransientRecoveryProbeError = (error: unknown): boolean => {
    if (!(error instanceof Error)) {
        return false;
    }

    return (
        transientNavigationTimeoutPattern.test(error.message) ||
        transientNavigationErrorPatterns.some((pattern) =>
            pattern.test(error.message),
        )
    );
};

const isRecoveredTargetReady = async ({
    expectedUrl,
    page,
}: {
    expectedUrl: string;
    page: NavigationTarget;
}): Promise<boolean> => {
    if (!doesPageMatchTargetUrl(page.url(), expectedUrl)) {
        return false;
    }

    try {
        const readyState = await page.evaluate(() => document.readyState);

        return readyState === 'interactive' || readyState === 'complete';
    } catch {
        return false;
    }
};

const waitForRecoveredTarget = async ({
    expectedUrl,
    navigationTimeoutMs,
    page,
}: {
    expectedUrl: string;
    navigationTimeoutMs: number;
    page: NavigationTarget;
}): Promise<boolean> => {
    try {
        await page.waitForURL(
            (url) => doesPageMatchTargetUrl(url.toString(), expectedUrl),
            {
                timeout:
                    resolveNavigationRecoveryTimeoutMs(navigationTimeoutMs),
                waitUntil: recoveryReadyState,
            },
        );

        return true;
    } catch (error) {
        if (!isTransientRecoveryProbeError(error)) {
            throw error;
        }

        return false;
    }
};

type ReplaceableNavigationTarget<T extends NavigationTarget> = T & {
    close: (options?: NavigationCloseOptions) => Promise<void>;
    context: () => {
        newPage: () => Promise<T>;
    };
};

const isClosedTargetError = (error: unknown): boolean =>
    error instanceof Error &&
    /Target page, context or browser has been closed/u.test(error.message);

const isReplaceableNavigationTarget = <T extends NavigationTarget>(
    page: T,
): page is ReplaceableNavigationTarget<T> =>
    typeof page.close === 'function' && typeof page.context === 'function';

const replaceNavigationTarget = async <T extends NavigationTarget>(
    page: T,
): Promise<T | null> => {
    if (!isReplaceableNavigationTarget(page)) {
        return null;
    }

    try {
        if (!page.isClosed?.()) {
            await page.close({
                runBeforeUnload: false,
            });
        }
    } catch (error) {
        if (!isClosedTargetError(error)) {
            throw error;
        }
    }

    return (await page.context().newPage()) as T;
};

const navigateOnTarget = async <T extends NavigationTarget>(
    page: T,
    navigate: (target: T) => Promise<void>,
    navigationTimeoutMs: number,
    expectedUrl: string,
): Promise<T> => {
    try {
        await navigate(page);
        return page;
    } catch (error) {
        if (!isTransientNavigationError(error)) {
            throw error;
        }

        await page.waitForTimeout(navigationRetryDelayMs);

        if (
            await isRecoveredTargetReady({
                expectedUrl,
                page,
            })
        ) {
            return page;
        }

        if (
            await waitForRecoveredTarget({
                expectedUrl,
                navigationTimeoutMs,
                page,
            })
        ) {
            return page;
        }

        if (
            await isRecoveredTargetReady({
                expectedUrl,
                page,
            })
        ) {
            return page;
        }

        throw error;
    }
};

export const gotoInteractablePage = async <T extends NavigationTarget>(
    page: T,
    url: string,
): Promise<T> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();

    try {
        return await navigateOnTarget(
            page,
            async (target) => {
                await target.goto(url, {
                    timeout: navigationTimeoutMs,
                    waitUntil: navigationReadyState,
                });
            },
            navigationTimeoutMs,
            url,
        );
    } catch (error) {
        if (!isTransientNavigationError(error)) {
            throw error;
        }

        const replacementPage = await replaceNavigationTarget(page);

        if (!replacementPage) {
            throw error;
        }

        return await navigateOnTarget(
            replacementPage,
            async (target) => {
                await target.goto(url, {
                    timeout: navigationTimeoutMs,
                    waitUntil: navigationReadyState,
                });
            },
            navigationTimeoutMs,
            url,
        );
    }
};

export const reloadInteractablePage = async <T extends NavigationTarget>(
    page: T,
): Promise<T> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();
    const currentPageUrl = page.url();

    try {
        return await navigateOnTarget(
            page,
            async (target) => {
                await target.reload({
                    timeout: navigationTimeoutMs,
                    waitUntil: navigationReadyState,
                });
            },
            navigationTimeoutMs,
            currentPageUrl,
        );
    } catch (error) {
        if (!isTransientNavigationError(error)) {
            throw error;
        }

        const replacementPage = await replaceNavigationTarget(page);

        if (!replacementPage) {
            throw error;
        }

        return await navigateOnTarget(
            replacementPage,
            async (target) => {
                await target.goto(currentPageUrl, {
                    timeout: navigationTimeoutMs,
                    waitUntil: navigationReadyState,
                });
            },
            navigationTimeoutMs,
            currentPageUrl,
        );
    }
};
