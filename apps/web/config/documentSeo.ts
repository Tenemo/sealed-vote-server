import {
    buildHomePageSeo,
    buildVotePageSeo,
    injectSeoIntoHtml,
    type SeoMetadata,
} from './seoMetadata.mts';

const defaultSeoApiBaseUrl = 'https://api.sealed.vote';

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

const openPollSeoCacheTtlMs = 5 * 1000;
const completedPollSeoCacheTtlMs = 60 * 1000;
const maxPollSeoCacheEntries = 128;

export const createPollSeoPayloadCache = (): PollSeoPayloadCache => new Map();

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

export const extractVoteSlugFromPathname = (
    pathname: string,
): string | null => {
    const segments = normalizePathname(pathname).split('/').filter(Boolean);

    if (segments[0] !== 'votes' || !segments[1]) {
        return null;
    }

    try {
        return decodeURIComponent(segments[1]);
    } catch {
        return null;
    }
};

const hasPublishedResults = (payload: SeoPollPayload): boolean =>
    payload.resultScores.some((score) => Number.isFinite(score));

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
            (hasPublishedResults(payload)
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

    const pollTitle = value.pollName.trim();

    if (!pollTitle) {
        return null;
    }

    return {
        pollName: pollTitle,
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

export const fetchPollTitle = async ({
    apiBaseUrl,
    cache,
    fetchImpl = fetch,
    now,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    cache?: PollSeoPayloadCache;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<string | null> => {
    const payload = await fetchPollSeoPayload({
        apiBaseUrl,
        cache,
        fetchImpl,
        now,
        pollSlug,
        signal,
    });

    return payload?.pollName ?? null;
};

export const resolveDocumentSeoMetadata = async ({
    apiBaseUrl = defaultSeoApiBaseUrl,
    fetchImpl,
    now,
    pollPayloadCache,
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollPayloadCache?: PollSeoPayloadCache;
    requestUrl: URL;
    signal?: AbortSignal;
}): Promise<SeoMetadata> => {
    const pollSlug = extractVoteSlugFromPathname(requestUrl.pathname);

    if (!pollSlug) {
        return buildHomePageSeo({
            origin: requestUrl.origin,
            pathname: requestUrl.pathname,
        });
    }

    const pollPayload = await fetchPollSeoPayload({
        apiBaseUrl,
        cache: pollPayloadCache,
        fetchImpl,
        now,
        pollSlug,
        signal,
    });

    return buildVotePageSeo({
        origin: requestUrl.origin,
        pollPath: requestUrl.pathname,
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
    pollPayloadCache,
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    baseHtml: string;
    fetchImpl?: FetchLike;
    now?: () => number;
    pollPayloadCache?: PollSeoPayloadCache;
    requestUrl: URL;
    signal?: AbortSignal;
}): Promise<string> => {
    const metadata = await resolveDocumentSeoMetadata({
        apiBaseUrl,
        fetchImpl,
        now,
        pollPayloadCache,
        requestUrl,
        signal,
    });

    return injectSeoIntoHtml(baseHtml, metadata);
};
