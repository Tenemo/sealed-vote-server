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

type NavigationReloadOptions = Omit<NavigationGotoOptions, 'referer'>;

export type NavigationTarget = {
    goto: (url: string, options?: NavigationGotoOptions) => Promise<unknown>;
    reload: (options?: NavigationReloadOptions) => Promise<unknown>;
    url: () => string;
    evaluate: <T>(pageFunction: () => T) => Promise<T>;
    waitForTimeout: (timeout: number) => Promise<void>;
};

// Production artifacts showed pages rendering successfully while Playwright was
// still waiting for a stricter navigation milestone. Keep generic navigation at
// the first committed response, then let each caller wait for the specific UI it
// needs before interacting.
const navigationReadyState = 'commit' as const;
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
const interactableReadyStates = new Set(['interactive', 'complete']);

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

const isInteractableDocumentReady = async (
    page: NavigationTarget,
): Promise<boolean> => {
    try {
        const readyState = await page.evaluate(() => document.readyState);

        return interactableReadyStates.has(readyState);
    } catch {
        return false;
    }
};

const didNavigationReachInteractableTarget = async ({
    expectedUrl,
    page,
}: {
    expectedUrl: string;
    page: NavigationTarget;
}): Promise<boolean> => {
    const currentPageUrl = page.url();

    if (!doesPageMatchTargetUrl(currentPageUrl, expectedUrl)) {
        return false;
    }

    return isInteractableDocumentReady(page);
};

const retryTransientNavigation = async (
    navigate: () => Promise<void>,
    page: NavigationTarget,
    expectedUrl: string,
): Promise<void> => {
    let attemptsRemaining = 2;

    while (attemptsRemaining > 0) {
        try {
            await navigate();
            return;
        } catch (error) {
            if (!isTransientNavigationError(error)) {
                throw error;
            }

            await page.waitForTimeout(navigationRetryDelayMs);

            if (
                await didNavigationReachInteractableTarget({
                    expectedUrl,
                    page,
                })
            ) {
                return;
            }

            attemptsRemaining -= 1;

            if (attemptsRemaining === 0) {
                throw error;
            }
        }
    }
};

export const gotoInteractablePage = async (
    page: NavigationTarget,
    url: string,
): Promise<void> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();

    await retryTransientNavigation(
        async () => {
            await page.goto(url, {
                timeout: navigationTimeoutMs,
                waitUntil: navigationReadyState,
            });
        },
        page,
        url,
    );
};

export const reloadInteractablePage = async (
    page: NavigationTarget,
): Promise<void> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();
    const currentPageUrl = page.url();

    await retryTransientNavigation(
        async () => {
            await page.reload({
                timeout: navigationTimeoutMs,
                waitUntil: navigationReadyState,
            });
        },
        page,
        currentPageUrl,
    );
};
