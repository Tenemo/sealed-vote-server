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
    /NS_ERROR_ABORT/u,
    /NS_ERROR_NET_TIMEOUT/u,
] as const;
const transientNavigationTimeoutPattern = /Timeout \d+ms exceeded/u;

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

const retryTransientNavigation = async (
    navigate: () => Promise<void>,
    page: NavigationTarget,
): Promise<void> => {
    try {
        await navigate();
    } catch (error) {
        if (!isTransientNavigationError(error)) {
            throw error;
        }

        await page.waitForTimeout(navigationRetryDelayMs);
        await navigate();
    }
};

export const gotoInteractablePage = async (
    page: NavigationTarget,
    url: string,
): Promise<void> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();

    await retryTransientNavigation(async () => {
        await page.goto(url, {
            timeout: navigationTimeoutMs,
            waitUntil: navigationReadyState,
        });
    }, page);
};

export const reloadInteractablePage = async (
    page: NavigationTarget,
): Promise<void> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();

    await retryTransientNavigation(async () => {
        await page.reload({
            timeout: navigationTimeoutMs,
            waitUntil: navigationReadyState,
        });
    }, page);
};
