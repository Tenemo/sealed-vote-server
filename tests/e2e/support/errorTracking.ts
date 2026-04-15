import {
    expect,
    type ConsoleMessage,
    type Page,
    type Response,
} from '@playwright/test';

type ErrorTrackingOptions = {
    allowedApiStatuses?: number[];
    allowedConsoleErrors?: RegExp[];
};

export type UnexpectedErrorTracker = {
    readonly errors: string[];
    readonly pendingChecks: Set<Promise<void>>;
};

const maxTrackedDetailLength = 240;

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

const normalizeTrackedText = (value: string): string =>
    value.replaceAll(/\s+/gu, ' ').trim();

const truncateTrackedText = (value: string): string =>
    value.length <= maxTrackedDetailLength
        ? value
        : `${value.slice(0, maxTrackedDetailLength - 3)}...`;

const matchesAllowedConsoleError = (
    pattern: RegExp,
    messageText: string,
): boolean => {
    const originalLastIndex = pattern.lastIndex;
    pattern.lastIndex = 0;

    try {
        return pattern.test(messageText);
    } finally {
        pattern.lastIndex = originalLastIndex;
    }
};

const formatTrackedLocation = ({
    columnNumber,
    lineNumber,
    url,
}: {
    columnNumber?: number;
    lineNumber?: number;
    url?: string;
}): string | null => {
    if (!url) {
        return null;
    }

    if (
        typeof lineNumber !== 'number' ||
        lineNumber < 0 ||
        typeof columnNumber !== 'number' ||
        columnNumber < 0
    ) {
        return url;
    }

    return `${url}:${lineNumber}:${columnNumber}`;
};

const formatTrackedPageUrl = (page: Page): string | null => {
    const pageUrl = page.url();

    return pageUrl ? pageUrl : null;
};

const formatConsoleError = ({
    label,
    message,
    page,
}: {
    label: string;
    message: ConsoleMessage;
    page: Page;
}): string => {
    const location = formatTrackedLocation(message.location());
    const pageUrl = formatTrackedPageUrl(page);
    const details = [
        `[${label}] console`,
        location ? `at ${location}` : null,
        pageUrl ? `(page ${pageUrl})` : null,
    ]
        .filter(Boolean)
        .join(' ');

    return `${details}: ${message.text()}`;
};

const extractResponseBodySummary = (bodyText: string): string | null => {
    const normalizedBodyText = normalizeTrackedText(bodyText);

    if (!normalizedBodyText) {
        return null;
    }

    try {
        const parsedBody = JSON.parse(bodyText) as {
            error?: unknown;
            message?: unknown;
        };

        if (typeof parsedBody.message === 'string') {
            return `message=${truncateTrackedText(
                normalizeTrackedText(parsedBody.message),
            )}`;
        }

        if (typeof parsedBody.error === 'string') {
            return `error=${truncateTrackedText(
                normalizeTrackedText(parsedBody.error),
            )}`;
        }
    } catch {
        return `body=${truncateTrackedText(normalizedBodyText)}`;
    }

    return `body=${truncateTrackedText(normalizedBodyText)}`;
};

const formatTrackedResponseError = async ({
    label,
    page,
    response,
    responseUrl,
}: {
    label: string;
    page: Page;
    response: Response;
    responseUrl: URL;
}): Promise<string> => {
    const method = response.request().method();
    const pageUrl = formatTrackedPageUrl(page);
    let bodySummary: string | null;

    try {
        bodySummary = extractResponseBodySummary(await response.text());
    } catch {
        bodySummary = null;
    }

    return [
        `[${label}] response: ${method} ${response.status()} ${responseUrl.toString()}`,
        pageUrl ? `(page ${pageUrl})` : null,
        bodySummary,
    ]
        .filter(Boolean)
        .join(' ');
};

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
    const allowedConsoleErrors = options.allowedConsoleErrors ?? [];

    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !allowedConsoleErrors.some((pattern) =>
                matchesAllowedConsoleError(pattern, message.text()),
            )
        ) {
            tracker.errors.push(
                formatConsoleError({
                    label,
                    message,
                    page,
                }),
            );
        }
    });

    page.on('pageerror', (error) => {
        const pageUrl = formatTrackedPageUrl(page);
        const stack =
            typeof error.stack === 'string' && error.stack.length > 0
                ? ` stack=${truncateTrackedText(
                      normalizeTrackedText(error.stack),
                  )}`
                : '';

        tracker.errors.push(
            `[${label}] pageerror${
                pageUrl ? ` (page ${pageUrl})` : ''
            }: ${error.message}${stack}`,
        );
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
            tracker.errors.push(
                await formatTrackedResponseError({
                    label,
                    page,
                    response,
                    responseUrl,
                }),
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
