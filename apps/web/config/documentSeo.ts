import {
    buildHomePageSeo,
    buildVotePageSeo,
    injectSeoIntoHtml,
    type SeoMetadata,
} from './seoMetadata.mts';

const defaultSeoApiBaseUrl = 'https://api.sealed.vote';

type FetchLike = typeof fetch;

const normalizePathname = (pathname: string): string =>
    pathname.startsWith('/') ? pathname : `/${pathname}`;

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

type SeoPollPayload = {
    pollName: string;
    resultScores: number[];
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
    fetchImpl = fetch,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<SeoPollPayload | null> => {
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

        return normalizeSeoPollPayload(await response.json());
    } catch {
        return null;
    }
};

export const fetchPollTitle = async ({
    apiBaseUrl,
    fetchImpl = fetch,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<string | null> => {
    const payload = await fetchPollSeoPayload({
        apiBaseUrl,
        fetchImpl,
        pollSlug,
        signal,
    });

    return payload?.pollName ?? null;
};

export const resolveDocumentSeoMetadata = async ({
    apiBaseUrl = defaultSeoApiBaseUrl,
    fetchImpl,
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    fetchImpl?: FetchLike;
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
        fetchImpl,
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
    requestUrl,
    signal,
}: {
    apiBaseUrl?: string;
    baseHtml: string;
    fetchImpl?: FetchLike;
    requestUrl: URL;
    signal?: AbortSignal;
}): Promise<string> => {
    const metadata = await resolveDocumentSeoMetadata({
        apiBaseUrl,
        fetchImpl,
        requestUrl,
        signal,
    });

    return injectSeoIntoHtml(baseHtml, metadata);
};
