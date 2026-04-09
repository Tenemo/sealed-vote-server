import type { Page } from '@playwright/test';

const navigationReadyState = 'domcontentloaded' as const;
const navigationTimeoutMs = 15_000;
const navigationRetryDelayMs = 1_000;
const transientNavigationErrorPatterns = [
    /NS_ERROR_ABORT/u,
    /NS_ERROR_NET_TIMEOUT/u,
] as const;

const isTransientNavigationError = (error: unknown): boolean =>
    error instanceof Error &&
    transientNavigationErrorPatterns.some((pattern) =>
        pattern.test(error.message),
    );

const retryTransientNavigation = async (
    navigate: () => Promise<void>,
    page: Page,
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
    page: Page,
    url: string,
): Promise<void> => {
    await retryTransientNavigation(async () => {
        await page.goto(url, {
            timeout: navigationTimeoutMs,
            waitUntil: navigationReadyState,
        });
    }, page);
};

export const reloadInteractablePage = async (page: Page): Promise<void> => {
    await retryTransientNavigation(async () => {
        await page.reload({
            timeout: navigationTimeoutMs,
            waitUntil: navigationReadyState,
        });
    }, page);
};
