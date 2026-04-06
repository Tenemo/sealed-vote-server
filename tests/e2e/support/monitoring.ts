import { expect, type Page } from '@playwright/test';

type ErrorTrackingOptions = {
    allowedApiStatuses?: number[];
};

export type UnexpectedErrorTracker = {
    readonly errors: string[];
};

export const createUnexpectedErrorTracker = (): UnexpectedErrorTracker => ({
    errors: [],
});

export const attachErrorTracking = (
    page: Page,
    label: string,
    tracker: UnexpectedErrorTracker,
    options: ErrorTrackingOptions = {},
): void => {
    const allowedApiStatuses = new Set(options.allowedApiStatuses ?? []);

    page.on('console', (message) => {
        if (message.type() === 'error') {
            tracker.errors.push(`[${label}] console: ${message.text()}`);
        }
    });

    page.on('pageerror', (error) => {
        tracker.errors.push(`[${label}] pageerror: ${error.message}`);
    });

    page.on('response', (response) => {
        if (
            response.url().includes('/api/') &&
            response.status() >= 400 &&
            !allowedApiStatuses.has(response.status())
        ) {
            tracker.errors.push(
                `[${label}] response: ${response.status()} ${response.url()}`,
            );
        }
    });
};

export const expectNoUnexpectedErrors = (
    tracker: UnexpectedErrorTracker,
): void => {
    expect(tracker.errors).toEqual([]);
};
