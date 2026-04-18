import {
    type ConsoleMessage,
    type Frame,
    type Page,
    type Request,
    type Response,
    type TestInfo,
} from '@playwright/test';

type ErrorTrackingOptions = {
    allowedApiStatuses?: number[];
    allowedConsoleErrors?: RegExp[];
};

type ErrorTrackingAttacher = (page: Page) => Page;

export type UnexpectedErrorTracker = {
    readonly errors: string[];
    readonly pendingChecks: Set<Promise<void>>;
    readonly recentEvents: string[];
    readonly trackedPages: Map<Page, string>;
    readonly testInfo?: TestInfo;
    reportAttached: boolean;
};

type TrackedPageSnapshot = {
    bodyText: string;
    locationHref: string;
    navigationEntry: {
        domContentLoadedEventEnd: number;
        duration: number;
        loadEventEnd: number;
        responseEnd: number;
        type: string;
    } | null;
    readyState: string;
    title: string;
    visibilityState: string;
};

const maxTrackedDetailLength = 240;
const maxTrackedRecentEvents = 40;
const pageSnapshotBodyTextLength = 320;
const pageSnapshotTimeoutMs = 5_000;
const unexpectedErrorReportAttachmentName =
    'unexpected-error-diagnostics.txt';

const knownApiHostnames = new Set([
    '127.0.0.1',
    'localhost',
    'sealed.vote',
    'api.sealed.vote',
]);
const trackedRequestFailureResourceTypes = new Set([
    'document',
    'fetch',
    'script',
    'stylesheet',
    'xhr',
]);
const recoverableBoardMessageResponseMessages = new Set([
    'The submitted payload does not match the active ceremony session.',
    'This participant is no longer part of the active ceremony.',
]);

export const createUnexpectedErrorTracker = ({
    testInfo,
}: {
    testInfo?: TestInfo;
} = {}): UnexpectedErrorTracker => ({
    errors: [],
    pendingChecks: new Set(),
    recentEvents: [],
    trackedPages: new Map(),
    reportAttached: false,
    testInfo,
});

const normalizeTrackedText = (value: string): string =>
    value.replaceAll(/\s+/gu, ' ').trim();

const truncateTrackedText = (
    value: string,
    maxLength = maxTrackedDetailLength,
): string =>
    value.length <= maxLength
        ? value
        : `${value.slice(0, maxLength - 3)}...`;

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
    let pageUrl = '';

    try {
        pageUrl = page.url();
    } catch {
        pageUrl = '';
    }

    return pageUrl ? pageUrl : null;
};

const pushTrackerEvent = (
    tracker: UnexpectedErrorTracker,
    message: string,
): void => {
    tracker.recentEvents.push(message);

    if (tracker.recentEvents.length > maxTrackedRecentEvents) {
        tracker.recentEvents.splice(
            0,
            tracker.recentEvents.length - maxTrackedRecentEvents,
        );
    }
};

const recordTrackedError = (
    tracker: UnexpectedErrorTracker,
    message: string,
): void => {
    tracker.errors.push(message);
    pushTrackerEvent(tracker, message);
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

    let parsedBody:
        | {
              error?: unknown;
              message?: unknown;
          }
        | undefined;

    try {
        parsedBody = JSON.parse(bodyText) as {
            error?: unknown;
            message?: unknown;
        };
    } catch {
        parsedBody = undefined;
    }

    if (typeof parsedBody?.message === 'string') {
        return `message=${truncateTrackedText(
            normalizeTrackedText(parsedBody.message),
        )}`;
    }

    if (typeof parsedBody?.error === 'string') {
        return `error=${truncateTrackedText(
            normalizeTrackedText(parsedBody.error),
        )}`;
    }

    return `body=${truncateTrackedText(normalizedBodyText)}`;
};

const extractResponseBodyMessage = (bodyText: string): string | null => {
    if (!bodyText) {
        return null;
    }

    let parsedBody:
        | {
              error?: unknown;
              message?: unknown;
          }
        | undefined;

    try {
        parsedBody = JSON.parse(bodyText) as {
            error?: unknown;
            message?: unknown;
        };
    } catch {
        parsedBody = undefined;
    }

    if (typeof parsedBody?.message === 'string') {
        return normalizeTrackedText(parsedBody.message);
    }

    if (typeof parsedBody?.error === 'string') {
        return normalizeTrackedText(parsedBody.error);
    }

    return null;
};

const isRecoverableBoardMessageResponse = ({
    bodyMessage,
    responseUrl,
}: {
    bodyMessage: string | null;
    responseUrl: URL;
}): boolean =>
    responseUrl.pathname.endsWith('/board/messages') &&
    bodyMessage !== null &&
    recoverableBoardMessageResponseMessages.has(bodyMessage);

const formatTrackedResponseError = ({
    bodySummary,
    label,
    page,
    response,
    responseUrl,
}: {
    bodySummary: string | null;
    label: string;
    page: Page;
    response: Response;
    responseUrl: URL;
}): string => {
    const method = response.request().method();
    const pageUrl = formatTrackedPageUrl(page);

    return [
        `[${label}] response: ${method} ${response.status()} ${responseUrl.toString()}`,
        pageUrl ? `(page ${pageUrl})` : null,
        bodySummary,
    ]
        .filter(Boolean)
        .join(' ');
};

const formatTrackedRequestFailure = ({
    label,
    page,
    request,
}: {
    label: string;
    page: Page;
    request: Request;
}): string => {
    const pageUrl = formatTrackedPageUrl(page);
    const failureText = request.failure()?.errorText;

    return [
        `[${label}] requestfailed: ${request.method()} ${request.url()}`,
        `resource=${request.resourceType()}`,
        pageUrl ? `(page ${pageUrl})` : null,
        failureText
            ? `failure=${truncateTrackedText(
                  normalizeTrackedText(failureText),
              )}`
            : null,
    ]
        .filter(Boolean)
        .join(' ');
};

const formatTrackedLifecycleEvent = ({
    eventName,
    label,
    page,
}: {
    eventName: 'close' | 'domcontentloaded' | 'load';
    label: string;
    page: Page;
}): string => {
    const pageUrl = formatTrackedPageUrl(page);

    return [
        `[${label}] ${eventName}`,
        pageUrl ? `(page ${pageUrl})` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

const formatTrackedFrameNavigation = ({
    frame,
    label,
    page,
}: {
    frame: Frame;
    label: string;
    page: Page;
}): string => {
    const pageUrl = formatTrackedPageUrl(page);
    const frameUrl = frame.url();

    return [
        `[${label}] framenavigated: ${frameUrl}`,
        pageUrl && pageUrl !== frameUrl ? `(page ${pageUrl})` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

const resolveTrackedHostnames = (page: Page): Set<string> => {
    const allowedHostnames = new Set(knownApiHostnames);
    const currentPageUrl = formatTrackedPageUrl(page);

    if (!currentPageUrl) {
        return allowedHostnames;
    }

    let currentPageHostname = '';

    try {
        currentPageHostname = new URL(currentPageUrl).hostname;
    } catch {
        return allowedHostnames;
    }

    allowedHostnames.add(currentPageHostname);

    if (
        currentPageHostname !== 'localhost' &&
        currentPageHostname !== '127.0.0.1'
    ) {
        allowedHostnames.add(`api.${currentPageHostname}`);
    }

    return allowedHostnames;
};

const isTrackedApiResponse = (page: Page, responseUrl: URL): boolean => {
    if (!responseUrl.pathname.includes('/api/')) {
        return false;
    }

    return resolveTrackedHostnames(page).has(responseUrl.hostname);
};

const isTrackedRequestFailure = (page: Page, request: Request): boolean => {
    let requestUrl: URL;

    try {
        requestUrl = new URL(request.url());
    } catch {
        return false;
    }

    return (
        trackedRequestFailureResourceTypes.has(request.resourceType()) &&
        resolveTrackedHostnames(page).has(requestUrl.hostname)
    );
};

const isTrackedMainFrame = (page: Page, frame: Frame): boolean =>
    frame === page.mainFrame();

const withTimeout = async <Result>(
    promise: Promise<Result>,
    label: string,
    timeoutMs: number,
): Promise<Result> => {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            promise,
            new Promise<Result>((_resolve, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(
                        new Error(
                            `${label} timed out after ${timeoutMs}ms.`,
                        ),
                    );
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
    }
};

const collectTrackedPageSnapshot = async (
    page: Page,
): Promise<TrackedPageSnapshot> =>
    await withTimeout(
        page.evaluate(() => {
            const navigationEntries =
                window.performance.getEntriesByType('navigation');
            const navigationEntry =
                navigationEntries.length > 0 ? navigationEntries[0] : null;
            const normalizedNavigationEntry =
                navigationEntry &&
                typeof navigationEntry === 'object' &&
                'responseEnd' in navigationEntry &&
                typeof navigationEntry.responseEnd === 'number' &&
                'domContentLoadedEventEnd' in navigationEntry &&
                typeof navigationEntry.domContentLoadedEventEnd === 'number' &&
                'loadEventEnd' in navigationEntry &&
                typeof navigationEntry.loadEventEnd === 'number' &&
                'duration' in navigationEntry &&
                typeof navigationEntry.duration === 'number' &&
                'type' in navigationEntry &&
                typeof navigationEntry.type === 'string'
                    ? {
                          domContentLoadedEventEnd: Math.round(
                              navigationEntry.domContentLoadedEventEnd,
                          ),
                          duration: Math.round(navigationEntry.duration),
                          loadEventEnd: Math.round(
                              navigationEntry.loadEventEnd,
                          ),
                          responseEnd: Math.round(
                              navigationEntry.responseEnd,
                          ),
                          type: navigationEntry.type,
                      }
                    : null;

            return {
                bodyText: document.body?.innerText ?? '',
                locationHref: window.location.href,
                navigationEntry: normalizedNavigationEntry,
                readyState: document.readyState,
                title: document.title,
                visibilityState: document.visibilityState,
            };
        }),
        'page snapshot',
        pageSnapshotTimeoutMs,
    );

const formatTrackedNavigationEntry = (
    navigationEntry: NonNullable<TrackedPageSnapshot['navigationEntry']>,
): string =>
    `navigation=${navigationEntry.type} responseEnd=${navigationEntry.responseEnd} domContentLoaded=${navigationEntry.domContentLoadedEventEnd} load=${navigationEntry.loadEventEnd} duration=${navigationEntry.duration}`;

const formatTrackedPageSnapshot = async ({
    label,
    page,
}: {
    label: string;
    page: Page;
}): Promise<string> => {
    const pageUrl = formatTrackedPageUrl(page);

    if (page.isClosed()) {
        return [
            `[${label}] snapshot: closed`,
            pageUrl ? `pageUrl=${pageUrl}` : null,
        ]
            .filter(Boolean)
            .join(' ');
    }

    try {
        const snapshot = await collectTrackedPageSnapshot(page);
        const bodyText = truncateTrackedText(
            normalizeTrackedText(snapshot.bodyText),
            pageSnapshotBodyTextLength,
        );
        const title = truncateTrackedText(
            normalizeTrackedText(snapshot.title),
        );

        return [
            `[${label}] snapshot:`,
            pageUrl ? `pageUrl=${pageUrl}` : null,
            snapshot.locationHref
                ? `location=${snapshot.locationHref}`
                : null,
            `readyState=${snapshot.readyState}`,
            `visibility=${snapshot.visibilityState}`,
            title ? `title=${JSON.stringify(title)}` : null,
            bodyText ? `body=${JSON.stringify(bodyText)}` : null,
            snapshot.navigationEntry
                ? formatTrackedNavigationEntry(snapshot.navigationEntry)
                : null,
        ]
            .filter(Boolean)
            .join(' ');
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        return [
            `[${label}] snapshot unavailable:`,
            pageUrl ? `pageUrl=${pageUrl}` : null,
            `reason=${truncateTrackedText(
                normalizeTrackedText(errorMessage),
            )}`,
        ]
            .filter(Boolean)
            .join(' ');
    }
};

const buildUnexpectedErrorReport = async (
    tracker: UnexpectedErrorTracker,
): Promise<string> => {
    const pageSnapshots = await Promise.all(
        [...tracker.trackedPages.entries()].map(
            async ([page, label]) =>
                await formatTrackedPageSnapshot({
                    label,
                    page,
                }),
        ),
    );
    const reportLines = [
        'Unexpected browser errors detected:',
        ...tracker.errors.map((message) => `- ${message}`),
    ];

    if (tracker.recentEvents.length > 0) {
        reportLines.push(
            '',
            'Recent page activity:',
            ...tracker.recentEvents.map((message) => `- ${message}`),
        );
    }

    if (pageSnapshots.length > 0) {
        reportLines.push(
            '',
            'Tracked page snapshots:',
            ...pageSnapshots.map((snapshot) => `- ${snapshot}`),
        );
    }

    return reportLines.join('\n');
};

const attachUnexpectedErrorReport = async (
    tracker: UnexpectedErrorTracker,
    report: string,
): Promise<void> => {
    if (!tracker.testInfo || tracker.reportAttached) {
        return;
    }

    tracker.reportAttached = true;
    await tracker.testInfo.attach(unexpectedErrorReportAttachmentName, {
        body: Buffer.from(report, 'utf8'),
        contentType: 'text/plain',
    });
};

export const attachErrorTracking = (
    page: Page,
    label: string,
    tracker: UnexpectedErrorTracker,
    options: ErrorTrackingOptions = {},
): void => {
    const allowedApiStatuses = new Set(options.allowedApiStatuses ?? []);
    const allowedConsoleErrors = options.allowedConsoleErrors ?? [];

    tracker.trackedPages.set(page, label);

    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !allowedConsoleErrors.some((pattern) =>
                matchesAllowedConsoleError(pattern, message.text()),
            )
        ) {
            recordTrackedError(
                tracker,
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

        recordTrackedError(
            tracker,
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
            let bodyText = '';

            try {
                bodyText = await response.text();
            } catch {
                bodyText = '';
            }

            const bodyMessage = extractResponseBodyMessage(bodyText);
            const bodySummary = extractResponseBodySummary(bodyText);
            const trackedResponseError = formatTrackedResponseError({
                bodySummary,
                label,
                page,
                response,
                responseUrl,
            });

            if (
                isRecoverableBoardMessageResponse({
                    bodyMessage,
                    responseUrl,
                })
            ) {
                pushTrackerEvent(tracker, trackedResponseError);
                return;
            }

            recordTrackedError(
                tracker,
                trackedResponseError,
            );
        })();

        tracker.pendingChecks.add(pendingCheck);
        void pendingCheck.finally(() => {
            tracker.pendingChecks.delete(pendingCheck);
        });
    });

    page.on('requestfailed', (request) => {
        if (!isTrackedRequestFailure(page, request)) {
            return;
        }

        pushTrackerEvent(
            tracker,
            formatTrackedRequestFailure({
                label,
                page,
                request,
            }),
        );
    });

    page.on('framenavigated', (frame) => {
        if (!isTrackedMainFrame(page, frame)) {
            return;
        }

        pushTrackerEvent(
            tracker,
            formatTrackedFrameNavigation({
                frame,
                label,
                page,
            }),
        );
    });

    page.on('domcontentloaded', () => {
        pushTrackerEvent(
            tracker,
            formatTrackedLifecycleEvent({
                eventName: 'domcontentloaded',
                label,
                page,
            }),
        );
    });

    page.on('load', () => {
        pushTrackerEvent(
            tracker,
            formatTrackedLifecycleEvent({
                eventName: 'load',
                label,
                page,
            }),
        );
    });

    page.on('close', () => {
        pushTrackerEvent(
            tracker,
            formatTrackedLifecycleEvent({
                eventName: 'close',
                label,
                page,
            }),
        );
        tracker.trackedPages.delete(page);
    });
};

export const createErrorTrackingAttacher = ({
    label,
    options = {},
    tracker,
}: {
    label: string;
    options?: ErrorTrackingOptions;
    tracker: UnexpectedErrorTracker;
}): ErrorTrackingAttacher => {
    const attachedPages = new WeakSet<Page>();

    return (page: Page): Page => {
        if (attachedPages.has(page)) {
            return page;
        }

        attachErrorTracking(page, label, tracker, options);
        attachedPages.add(page);
        return page;
    };
};

export const expectNoUnexpectedErrors = async (
    tracker: UnexpectedErrorTracker,
): Promise<void> => {
    await Promise.allSettled([...tracker.pendingChecks]);

    if (tracker.errors.length === 0) {
        return;
    }

    const report = await buildUnexpectedErrorReport(tracker);
    await attachUnexpectedErrorReport(tracker, report);
    throw new Error(report);
};
