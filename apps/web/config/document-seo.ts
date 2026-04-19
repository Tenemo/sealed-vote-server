import { hasPublishedResultScores } from './poll-results.mts';
import {
    buildCreatePageSeo,
    buildHomePageSeo,
    buildPollPageSeo,
    injectSeoIntoHtml,
    type SeoMetadata,
} from './seo-metadata.mts';

const defaultSeoApiBaseUrl = 'https://api.sealed.vote';
const defaultPollSeoPayloadLookupTimeoutMs = 1_500;
const seoCrawlerUserAgentPattern =
    /bot|crawler|spider|facebookexternalhit|slackbot|discordbot|twitterbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot|duckduckbot|applebot|embedly|quora link preview|pinterest|skypeuripreview/i;

type FetchLike = typeof fetch;
type SeoPollPayload = {
    pollName: string;
    resultScores: number[];
};
type PollSeoPayloadCacheEntry = {
    expiresAt: number;
    payload: SeoPollPayload;
};

export type PollSeoPayloadCache = Map<string, PollSeoPayloadCacheEntry>;

const normalizePathname = (pathname: string): string =>
    pathname.startsWith('/') ? pathname : `/${pathname}`;
const canonicalPollRouteSegment = 'polls';

const openPollSeoCacheTtlMs = 5 * 1000;
const completedPollSeoCacheTtlMs = 60 * 1000;
const maxPollSeoCacheEntries = 128;

export const createPollSeoPayloadCache = (): PollSeoPayloadCache => new Map();

export const shouldFetchPollSeoPayloadForRequest = (
    requestUserAgent?: string | null,
): boolean => {
    if (requestUserAgent === undefined) {
        return true;
    }

    const normalizedUserAgent = requestUserAgent?.trim();

    if (!normalizedUserAgent) {
        return false;
    }

    return seoCrawlerUserAgentPattern.test(normalizedUserAgent);
};

export const resolveSeoApiBaseUrl = (rawBaseUrl?: string | null): string => {
    const trimmedBaseUrl = rawBaseUrl?.trim();

    if (!trimmedBaseUrl) {
        return defaultSeoApiBaseUrl;
    }

    try {
        const parsedBaseUrl = new URL(trimmedBaseUrl);

        if (
            parsedBaseUrl.protocol !== 'http:' &&
            parsedBaseUrl.protocol !== 'https:'
        ) {
            return defaultSeoApiBaseUrl;
        }

        return parsedBaseUrl.origin;
    } catch {
        return defaultSeoApiBaseUrl;
    }
};

export const extractPollSlugFromPathname = (
    pathname: string,
): string | null => {
    const segments = normalizePathname(pathname).split('/').filter(Boolean);

    if (!segments[1] || segments[0] !== canonicalPollRouteSegment) {
        return null;
    }

    try {
        return decodeURIComponent(segments[1]);
    } catch {
        return null;
    }
};

const createCanonicalPollPath = (pollSlug: string): string =>
    `/${canonicalPollRouteSegment}/${encodeURIComponent(pollSlug)}`;

const createPollSeoPayloadCacheKey = (
    apiBaseUrl: string,
    pollSlug: string,
): string => `${apiBaseUrl}\n${pollSlug}`;

const prunePollSeoPayloadCache = (
    cache: PollSeoPayloadCache,
    nowMs: number,
): void => {
    for (const [cacheKey, cachedPayload] of cache) {
        if (cachedPayload.expiresAt <= nowMs) {
            cache.delete(cacheKey);
        }
    }

    while (cache.size > maxPollSeoCacheEntries) {
        const oldestCacheKey = cache.keys().next().value;

        if (!oldestCacheKey) {
            break;
        }

        cache.delete(oldestCacheKey);
    }
};

const readPollSeoPayloadCache = (
    cache: PollSeoPayloadCache | undefined,
    cacheKey: string,
    nowMs: number,
): SeoPollPayload | null => {
    const cachedPayload = cache?.get(cacheKey);

    if (!cachedPayload) {
        return null;
    }

    if (cachedPayload.expiresAt > nowMs) {
        return cachedPayload.payload;
    }

    cache?.delete(cacheKey);
    return null;
};

const writePollSeoPayloadCache = (
    cache: PollSeoPayloadCache | undefined,
    cacheKey: string,
    nowMs: number,
    payload: SeoPollPayload,
): void => {
    if (!cache) {
        return;
    }

    cache.set(cacheKey, {
        expiresAt:
            nowMs +
            (hasPublishedResultScores(payload.resultScores)
                ? completedPollSeoCacheTtlMs
                : openPollSeoCacheTtlMs),
        payload,
    });
    prunePollSeoPayloadCache(cache, nowMs);
};

const isPollPayload = (
    value: unknown,
): value is {
    pollName: string;
    resultScores?: unknown;
} =>
    typeof value === 'object' &&
    value !== null &&
    'pollName' in value &&
    typeof value.pollName === 'string';

const normalizeNumberArray = (value: unknown): number[] =>
    Array.isArray(value)
        ? value.filter(
              (item): item is number =>
                  typeof item === 'number' && Number.isFinite(item),
          )
        : [];

const normalizeSeoPollPayload = (value: unknown): SeoPollPayload | null => {
    if (!isPollPayload(value)) {
        return null;
    }

    const normalizedPollName = value.pollName.trim();

    if (!normalizedPollName) {
        return null;
    }

    return {
        pollName: normalizedPollName,
        resultScores: normalizeNumberArray(value.resultScores),
    };
};

const fetchPollSeoPayload = async ({
    apiBaseUrl,
    cache,
    fetchImpl = fetch,
    now = Date.now,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    cache?: PollSeoPayloadCache;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<SeoPollPayload | null> => {
    const cacheKey = createPollSeoPayloadCacheKey(apiBaseUrl, pollSlug);
    const nowMs = now();
    const cachedPayload = readPollSeoPayloadCache(cache, cacheKey, nowMs);

    if (cachedPayload) {
        return cachedPayload;
    }

    try {
        const response = await fetchImpl(
            new URL(`/api/polls/${encodeURIComponent(pollSlug)}`, apiBaseUrl),
            {
                headers: {
                    accept: 'application/json',
                },
                signal,
            },
        );

        if (!response.ok) {
            return null;
        }

        const payload = normalizeSeoPollPayload(await response.json());

        if (payload) {
            writePollSeoPayloadCache(cache, cacheKey, nowMs, payload);
        }

        return payload;
    } catch {
        return null;
    }
};

const waitForPollSeoPayload = async ({
    apiBaseUrl,
    cache,
    fetchImpl = fetch,
    now,
    pollPayloadLookupTimeoutMs = defaultPollSeoPayloadLookupTimeoutMs,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    cache?: PollSeoPayloadCache;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollPayloadLookupTimeoutMs?: number;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<SeoPollPayload | null> => {
    const lookupAbortController = new AbortController();
    const abortLookup = (): void => {
        if (!lookupAbortController.signal.aborted) {
            lookupAbortController.abort();
        }
    };
    const handleSignalAbort = (): void => {
        abortLookup();
    };

    if (signal?.aborted) {
        abortLookup();
    } else {
        signal?.addEventListener('abort', handleSignalAbort, {
            once: true,
        });
    }

    const pendingPayload = fetchPollSeoPayload({
        apiBaseUrl,
        cache,
        fetchImpl,
        now,
        pollSlug,
        signal: lookupAbortController.signal,
    }).catch(() => null);

    if (pollPayloadLookupTimeoutMs < 1) {
        try {
            return await pendingPayload;
        } finally {
            signal?.removeEventListener('abort', handleSignalAbort);
        }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            pendingPayload,
            new Promise<SeoPollPayload | null>((resolve) => {
                timeoutId = setTimeout(() => {
                    abortLookup();
                    resolve(null);
                }, pollPayloadLookupTimeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }

        signal?.removeEventListener('abort', handleSignalAbort);
    }
};

export const resolveDocumentSeoMetadata = async ({
    apiBaseUrl = defaultSeoApiBaseUrl,
    fetchImpl,
    now,
    pollPayloadLookupTimeoutMs,
    pollPayloadCache,
    requestUserAgent,
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollPayloadLookupTimeoutMs?: number;
    pollPayloadCache?: PollSeoPayloadCache;
    requestUserAgent?: string | null;
    requestUrl: URL;
    signal?: AbortSignal;
}): Promise<SeoMetadata> => {
    const pollSlug = extractPollSlugFromPathname(requestUrl.pathname);

    if (!pollSlug) {
        if (normalizePathname(requestUrl.pathname) === '/') {
            return buildCreatePageSeo({
                origin: requestUrl.origin,
                pathname: requestUrl.pathname,
            });
        }

        return buildHomePageSeo({
            origin: requestUrl.origin,
            pathname: requestUrl.pathname,
        });
    }

    // Only crawlers need poll-specific metadata before the SPA hydrates. Human
    // browsers should not block the poll page document on an extra API fetch.
    const pollPayload = shouldFetchPollSeoPayloadForRequest(requestUserAgent)
        ? await waitForPollSeoPayload({
              apiBaseUrl,
              cache: pollPayloadCache,
              fetchImpl,
              now,
              pollPayloadLookupTimeoutMs,
              pollSlug,
              signal,
          })
        : null;

    return buildPollPageSeo({
        origin: requestUrl.origin,
        pollPath: createCanonicalPollPath(pollSlug),
        pollSlug,
        pollTitle: pollPayload?.pollName,
        resultScores: pollPayload?.resultScores,
    });
};

export const renderDocumentHtml = async ({
    apiBaseUrl = defaultSeoApiBaseUrl,
    baseHtml,
    fetchImpl,
    now,
    pollPayloadLookupTimeoutMs,
    pollPayloadCache,
    requestUserAgent,
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    baseHtml: string;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollPayloadLookupTimeoutMs?: number;
    pollPayloadCache?: PollSeoPayloadCache;
    requestUserAgent?: string | null;
    requestUrl: URL;
    signal?: AbortSignal;
}): Promise<string> => {
    const metadata = await resolveDocumentSeoMetadata({
        apiBaseUrl,
        fetchImpl,
        now,
        pollPayloadLookupTimeoutMs,
        pollPayloadCache,
        requestUserAgent,
        requestUrl,
        signal,
    });

    return injectSeoIntoHtml(baseHtml, metadata);
};
