import { expect, type Page } from '@playwright/test';

type ErrorTrackingOptions = {
    allowedApiStatuses?: number[];
};

export type UnexpectedErrorTracker = {
    readonly errors: string[];
    readonly pendingChecks: Set<Promise<void>>;
};

const boardMessageSessionMismatchMessage =
    'The submitted payload does not match the active ceremony session.';

const knownApiHostnames = new Set([
    '127.0.0.1',
    'localhost',
    'sealed.vote',
    'api.sealed.vote',
]);

export const createUnexpectedErrorTracker = (): UnexpectedErrorTracker => ({
    errors: [],
    pendingChecks: new Set(),
});

const isTrackedApiResponse = (page: Page, responseUrl: URL): boolean => {
    if (!responseUrl.pathname.includes('/api/')) {
        return false;
    }

    const allowedHostnames = new Set(knownApiHostnames);
    const currentPageUrl = page.url();

    if (currentPageUrl) {
        const currentPageHostname = new URL(currentPageUrl).hostname;
        allowedHostnames.add(currentPageHostname);

        if (
            currentPageHostname !== 'localhost' &&
            currentPageHostname !== '127.0.0.1'
        ) {
            allowedHostnames.add(`api.${currentPageHostname}`);
        }
    }

    return allowedHostnames.has(responseUrl.hostname);
};

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
        const responseUrl = new URL(response.url());

        if (
            !isTrackedApiResponse(page, responseUrl) ||
            response.status() < 400 ||
            allowedApiStatuses.has(response.status())
        ) {
            return;
        }

        const pendingCheck = (async () => {
            if (responseUrl.pathname.endsWith('/board/messages')) {
                try {
                    const body = JSON.parse(await response.text()) as {
                        message?: unknown;
                    };

                    if (
                        body.message === boardMessageSessionMismatchMessage
                    ) {
                        return;
                    }
                } catch {
                    // Fall through to the generic error capture below.
                }
            }

            tracker.errors.push(
                `[${label}] response: ${response.status()} ${responseUrl.toString()}`,
            );
        })();

        tracker.pendingChecks.add(pendingCheck);
        void pendingCheck.finally(() => {
            tracker.pendingChecks.delete(pendingCheck);
        });
    });
};

export const expectNoUnexpectedErrors = (
    tracker: UnexpectedErrorTracker,
): Promise<void> =>
    Promise.allSettled([...tracker.pendingChecks]).then(() => {
        expect(tracker.errors).toEqual([]);
    });
