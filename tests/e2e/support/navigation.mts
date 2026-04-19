import { isLocalLoopbackHostname } from './local-origin.mts';

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

type NavigationViewportSize = {
    height: number;
    width: number;
};

type NavigationReloadOptions = Omit<NavigationGotoOptions, 'referer'>;
type NavigationWaitForUrlOptions = Omit<NavigationGotoOptions, 'referer'>;
type NavigationUrlMatcher = string | RegExp | ((url: URL) => boolean);

export type NavigationTarget = {
    content?: () => Promise<string>;
    goto: (url: string, options?: NavigationGotoOptions) => Promise<unknown>;
    reload: (options?: NavigationReloadOptions) => Promise<unknown>;
    title?: () => Promise<string>;
    url: () => string;
    evaluate: <Result>(
        pageFunction: () => Result | Promise<Result>,
    ) => Promise<Result>;
    close?: (options?: NavigationCloseOptions) => Promise<void>;
    context?: () => {
        newPage: () => Promise<NavigationTarget>;
    };
    isClosed?: () => boolean;
    setViewportSize?: (viewportSize: NavigationViewportSize) => Promise<void>;
    viewportSize?: () => NavigationViewportSize | null;
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
const navigationDiagnosticSnippetLength = 240;
const maximumNavigationProbeTimeoutMs = 2_000;
const minimumNavigationProbeTimeoutMs = 250;
const blankNavigationContentPattern = /<body[^>]*><\/body>/u;
const loadingNavigationTitlePatterns = [
    /^loading\s+https?:\/\//iu,
    /^connecting\s+to\s+/iu,
    /^waiting\s+for\s+/iu,
] as const;

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

const normalizeNavigationText = (value: string): string =>
    value.replaceAll(/\s+/gu, ' ').trim();

const truncateNavigationText = (value: string): string =>
    value.length <= navigationDiagnosticSnippetLength
        ? value
        : `${value.slice(0, navigationDiagnosticSnippetLength - 3)}...`;

const extractNavigationContentSnippet = (html: string): string | null => {
    const normalizedText = normalizeNavigationText(
        html
            .replaceAll(/<script\b[\s\S]*?<\/script>/giu, ' ')
            .replaceAll(/<style\b[\s\S]*?<\/style>/giu, ' ')
            .replaceAll(/<[^>]+>/gu, ' '),
    );

    return normalizedText
        ? truncateNavigationText(normalizedText)
        : null;
};

const normalizeNavigationHtml = (value: string): string =>
    value
        .replaceAll(/<!doctype[^>]*>/giu, '')
        .replaceAll(/\s+/gu, '')
        .toLowerCase();

const isBlankNavigationStartUrl = (value: string): boolean =>
    !value || value === 'about:blank';

const isLocalNavigationOrigin = (url: URL): boolean =>
    isLocalLoopbackHostname(url.hostname);

const resolveNavigationBootstrapUrl = ({
    currentUrl,
    targetUrl,
}: {
    currentUrl: string;
    targetUrl: string;
}): string | null => {
    if (!isBlankNavigationStartUrl(currentUrl)) {
        return null;
    }

    const parsedAbsoluteTargetUrl = tryParseUrl(targetUrl);

    if (parsedAbsoluteTargetUrl) {
        if (
            parsedAbsoluteTargetUrl.protocol !== 'http:' &&
            parsedAbsoluteTargetUrl.protocol !== 'https:'
        ) {
            return null;
        }

        // The origin bootstrap exists for live production deep links. On local
        // CI origins it only loads the homepage briefly, which aborts
        // VersionBadge's /version.json fetch and surfaces a bogus WebKit
        // pageerror before the real deep-link navigation starts.
        if (isLocalNavigationOrigin(parsedAbsoluteTargetUrl)) {
            return null;
        }

        if (
            parsedAbsoluteTargetUrl.pathname === '/' &&
            !parsedAbsoluteTargetUrl.search &&
            !parsedAbsoluteTargetUrl.hash
        ) {
            return null;
        }

        return `${parsedAbsoluteTargetUrl.origin}/`;
    }

    const parsedRelativeTargetUrl = tryParseUrl(targetUrl, relativeUrlBase);

    if (!parsedRelativeTargetUrl) {
        return null;
    }

    return targetUrl === '/' ? null : '/';
};

// Recovery probes must never consume the whole test budget. When a live page
// gets stuck mid-navigation we need these reads to give up quickly so the
// caller can continue with fallback recovery.
const runNavigationProbe = async <Result,>(
    probe: () => Promise<Result>,
    timeoutMs: number,
): Promise<Result | null> => {
    let didTimeOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const probePromise = probe().catch(() => null as Result | null);
    const timedProbePromise = probePromise.then((result) =>
        didTimeOut ? null : result,
    );

    try {
        return await Promise.race([
            timedProbePromise,
            new Promise<null>((resolve) => {
                timeoutHandle = setTimeout(() => {
                    didTimeOut = true;
                    resolve(null);
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle !== null) {
            clearTimeout(timeoutHandle);
        }
    }
};

const hasMeaningfulNavigationDocument = async ({
    page,
    probeTimeoutMs,
}: {
    page: NavigationTarget;
    probeTimeoutMs: number;
}): Promise<boolean | null> => {
    if (typeof page.content !== 'function') {
        return null;
    }

    const html = await runNavigationProbe(() => page.content!(), probeTimeoutMs);

    if (html === null) {
        return null;
    }

    const normalizedHtml = normalizeNavigationHtml(html);

    if (!normalizedHtml) {
        return false;
    }

    return !blankNavigationContentPattern.test(normalizedHtml);
};

const isLoadingNavigationTitle = (title: string): boolean =>
    loadingNavigationTitlePatterns.some((pattern) => pattern.test(title));

const createNavigationOperationTimeoutError = (
    actionLabel: string,
    timeoutMs: number,
): Error => new Error(`${actionLabel}: Timeout ${timeoutMs}ms exceeded.`);

const runNavigationAction = async (
    actionLabel: string,
    action: () => Promise<void>,
    timeoutMs: number,
): Promise<void> => {
    let didTimeOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const actionPromise = action().catch((error: unknown) => {
        if (didTimeOut) {
            return;
        }

        throw error;
    });

    try {
        await Promise.race([
            actionPromise,
            new Promise<void>((_resolve, reject) => {
                timeoutHandle = setTimeout(() => {
                    didTimeOut = true;
                    reject(
                        createNavigationOperationTimeoutError(
                            actionLabel,
                            timeoutMs,
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

const resolveNavigationRecoveryTimeoutMs = (
    navigationTimeoutMs: number,
): number =>
    Math.min(10_000, Math.max(2_000, Math.floor(navigationTimeoutMs / 4)));

const resolveNavigationLateRecoveryTimeoutMs = (
    navigationTimeoutMs: number,
): number =>
    Math.min(30_000, Math.max(5_000, Math.floor(navigationTimeoutMs / 2)));

const resolveNavigationProbeTimeoutMs = (
    navigationTimeoutMs: number,
): number =>
    Math.min(
        maximumNavigationProbeTimeoutMs,
        Math.max(
            minimumNavigationProbeTimeoutMs,
            Math.floor(navigationTimeoutMs / 10),
        ),
    );

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

const getNavigationTargetReadyState = async (
    page: NavigationTarget,
    probeTimeoutMs: number,
): Promise<string | null> => {
    return await runNavigationProbe(
        () => page.evaluate(() => document.readyState),
        probeTimeoutMs,
    );
};

const getNavigationTargetTitle = async (
    page: NavigationTarget,
    probeTimeoutMs: number,
): Promise<string | null> => {
    if (typeof page.title !== 'function') {
        return null;
    }

    const title = await runNavigationProbe(() => page.title!(), probeTimeoutMs);

    return title ? truncateNavigationText(normalizeNavigationText(title)) : null;
};

const getNavigationTargetContentSnippet = async (
    page: NavigationTarget,
    probeTimeoutMs: number,
): Promise<string | null> => {
    if (typeof page.content !== 'function') {
        return null;
    }

    const html = await runNavigationProbe(() => page.content!(), probeTimeoutMs);

    return html === null ? null : extractNavigationContentSnippet(html);
};

const getNavigationTargetUrl = (page: NavigationTarget): string => {
    try {
        return page.url();
    } catch {
        return '';
    }
};

const formatNavigationFailureDiagnostics = async ({
    expectedUrl,
    navigationTimeoutMs,
    page,
}: {
    expectedUrl: string;
    navigationTimeoutMs: number;
    page: NavigationTarget;
}): Promise<string> => {
    const currentUrl = getNavigationTargetUrl(page);
    const probeTimeoutMs = resolveNavigationProbeTimeoutMs(navigationTimeoutMs);
    const readyState = await getNavigationTargetReadyState(
        page,
        probeTimeoutMs,
    );
    const title = await getNavigationTargetTitle(page, probeTimeoutMs);
    const contentSnippet = await getNavigationTargetContentSnippet(
        page,
        probeTimeoutMs,
    );

    return [
        'navigation diagnostics:',
        currentUrl ? `currentUrl=${currentUrl}` : 'currentUrl=<empty>',
        `expectedUrl=${expectedUrl}`,
        `matchesExpected=${doesPageMatchTargetUrl(currentUrl, expectedUrl)}`,
        `readyState=${readyState ?? '<unavailable>'}`,
        typeof page.isClosed === 'function'
            ? `closed=${page.isClosed()}`
            : null,
        `recoveryWaitMs=${resolveNavigationRecoveryTimeoutMs(
            navigationTimeoutMs,
        )}`,
        `lateRecoveryWaitMs=${resolveNavigationLateRecoveryTimeoutMs(
            navigationTimeoutMs,
        )}`,
        `probeTimeoutMs=${probeTimeoutMs}`,
        title ? `title=${JSON.stringify(title)}` : null,
        contentSnippet ? `content=${JSON.stringify(contentSnippet)}` : null,
    ]
        .filter(Boolean)
        .join(' ');
};

const appendNavigationFailureDiagnostics = async ({
    error,
    expectedUrl,
    navigationTimeoutMs,
    page,
}: {
    error: unknown;
    expectedUrl: string;
    navigationTimeoutMs: number;
    page: NavigationTarget;
}): Promise<Error> => {
    const diagnostics = await formatNavigationFailureDiagnostics({
        expectedUrl,
        navigationTimeoutMs,
        page,
    });

    if (error instanceof Error) {
        if (!error.message.includes(diagnostics)) {
            error.message = `${error.message}\n${diagnostics}`;
        }

        return error;
    }

    return new Error(`${String(error)}\n${diagnostics}`);
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
    probeTimeoutMs,
}: {
    expectedUrl: string;
    page: NavigationTarget;
    probeTimeoutMs: number;
}): Promise<boolean> => {
    if (!doesPageMatchTargetUrl(page.url(), expectedUrl)) {
        return false;
    }

    const readyState = await getNavigationTargetReadyState(page, probeTimeoutMs);

    if (readyState !== 'interactive' && readyState !== 'complete') {
        return false;
    }

    const hasMeaningfulDocument = await hasMeaningfulNavigationDocument({
        page,
        probeTimeoutMs,
    });

    if (hasMeaningfulDocument === false) {
        return false;
    }

    if (hasMeaningfulDocument === true) {
        return true;
    }

    const title = await getNavigationTargetTitle(page, probeTimeoutMs);

    return Boolean(title && !isLoadingNavigationTitle(title));
};

const isBlankOffTargetNavigationStall = async ({
    expectedUrl,
    page,
    probeTimeoutMs,
}: {
    expectedUrl: string;
    page: NavigationTarget;
    probeTimeoutMs: number;
}): Promise<boolean> => {
    if (doesPageMatchTargetUrl(page.url(), expectedUrl)) {
        return false;
    }

    const readyState = await getNavigationTargetReadyState(page, probeTimeoutMs);

    if (readyState !== 'interactive' && readyState !== 'complete') {
        return false;
    }

    const hasMeaningfulDocument = await hasMeaningfulNavigationDocument({
        page,
        probeTimeoutMs,
    });

    if (hasMeaningfulDocument === true) {
        return false;
    }

    if (hasMeaningfulDocument === false) {
        return true;
    }

    const title = await getNavigationTargetTitle(page, probeTimeoutMs);

    return !title || isLoadingNavigationTitle(title);
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

        return await isRecoveredTargetReady({
            expectedUrl,
            page,
            probeTimeoutMs: resolveNavigationProbeTimeoutMs(
                navigationTimeoutMs,
            ),
        });
    } catch (error) {
        if (!isTransientRecoveryProbeError(error)) {
            throw error;
        }

        return false;
    }
};

// Live production can occasionally finish rendering after Playwright gives up
// on the navigation promise, so keep observing the recovered page state a bit
// longer before failing or replacing the target.
const waitForLateRecoveredTarget = async ({
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
                    resolveNavigationLateRecoveryTimeoutMs(
                        navigationTimeoutMs,
                    ),
                waitUntil: recoveryReadyState,
            },
        );
    } catch (error) {
        if (!isTransientRecoveryProbeError(error)) {
            throw error;
        }
    }

    return await isRecoveredTargetReady({
        expectedUrl,
        page,
        probeTimeoutMs: resolveNavigationProbeTimeoutMs(navigationTimeoutMs),
    });
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

    const previousViewportSize = page.viewportSize?.() ?? null;

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

    const replacementPage = (await page.context().newPage()) as T;

    if (previousViewportSize && replacementPage.setViewportSize) {
        await replacementPage.setViewportSize(previousViewportSize);
    }

    return replacementPage;
};

const navigateOnTarget = async <T extends NavigationTarget>(
    page: T,
    navigate: (target: T) => Promise<void>,
    navigationTimeoutMs: number,
    expectedUrl: string,
): Promise<T> => {
    const probeTimeoutMs = resolveNavigationProbeTimeoutMs(navigationTimeoutMs);

    try {
        await navigate(page);
        return page;
    } catch (error) {
        if (!isTransientNavigationError(error)) {
            throw await appendNavigationFailureDiagnostics({
                error,
                expectedUrl,
                navigationTimeoutMs,
                page,
            });
        }

        await page.waitForTimeout(navigationRetryDelayMs);

        if (
            await isRecoveredTargetReady({
                expectedUrl,
                page,
                probeTimeoutMs,
            })
        ) {
            return page;
        }

        if (
            await isBlankOffTargetNavigationStall({
                expectedUrl,
                page,
                probeTimeoutMs,
            })
        ) {
            throw error;
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
                probeTimeoutMs,
            })
        ) {
            return page;
        }

        if (
            await isBlankOffTargetNavigationStall({
                expectedUrl,
                page,
                probeTimeoutMs,
            })
        ) {
            throw error;
        }

        if (
            await waitForLateRecoveredTarget({
                expectedUrl,
                navigationTimeoutMs,
                page,
            })
        ) {
            return page;
        }

        throw await appendNavigationFailureDiagnostics({
            error,
            expectedUrl,
            navigationTimeoutMs,
            page,
        });
    }
};

export const gotoInteractablePage = async <T extends NavigationTarget>(
    page: T,
    url: string,
): Promise<T> => {
    const navigationTimeoutMs = resolveNavigationTimeoutMs();
    const bootstrapUrl = resolveNavigationBootstrapUrl({
        currentUrl: page.url(),
        targetUrl: url,
    });

    // Mobile Firefox production artifacts showed deep links timing out when a
    // fresh participant page jumped straight from about:blank to the vote URL,
    // while pages that first established the origin on "/" stayed stable.
    if (bootstrapUrl) {
        page = await gotoInteractablePage(page, bootstrapUrl);
    }

    try {
        return await navigateOnTarget(
            page,
            async (target) => {
                await runNavigationAction(
                    'page.goto',
                    async () => {
                        await target.goto(url, {
                            timeout: navigationTimeoutMs,
                            waitUntil: navigationReadyState,
                        });
                    },
                    navigationTimeoutMs,
                );
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
                await runNavigationAction(
                    'page.goto',
                    async () => {
                        await target.goto(url, {
                            timeout: navigationTimeoutMs,
                            waitUntil: navigationReadyState,
                        });
                    },
                    navigationTimeoutMs,
                );
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
                await runNavigationAction(
                    'page.reload',
                    async () => {
                        await target.reload({
                            timeout: navigationTimeoutMs,
                            waitUntil: navigationReadyState,
                        });
                    },
                    navigationTimeoutMs,
                );
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

        let fallbackPage = replacementPage;
        const bootstrapUrl = resolveNavigationBootstrapUrl({
            currentUrl: fallbackPage.url(),
            targetUrl: currentPageUrl,
        });

        // When reload recovery has to replace the page, the new target starts
        // from about:blank again. Mobile Firefox production runs showed that
        // deep-linking straight from that blank page can abort, while first
        // re-establishing the origin on "/" stays stable.
        if (bootstrapUrl) {
            fallbackPage = await gotoInteractablePage(
                fallbackPage,
                bootstrapUrl,
            );
        }

        return await navigateOnTarget(
            fallbackPage,
            async (target) => {
                await runNavigationAction(
                    'page.goto',
                    async () => {
                        await target.goto(currentPageUrl, {
                            timeout: navigationTimeoutMs,
                            waitUntil: navigationReadyState,
                        });
                    },
                    navigationTimeoutMs,
                );
            },
            navigationTimeoutMs,
            currentPageUrl,
        );
    }
};
