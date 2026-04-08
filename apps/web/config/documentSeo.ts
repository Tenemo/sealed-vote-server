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

    const parsedBaseUrl = new URL(trimmedBaseUrl);

    if (
        parsedBaseUrl.protocol !== 'http:' &&
        parsedBaseUrl.protocol !== 'https:'
    ) {
        throw new TypeError(
            'SEO API base URL must use the http or https protocol.',
        );
    }

    return parsedBaseUrl.origin;
};

export const extractVoteSlugFromPathname = (
    pathname: string,
): string | null => {
    const segments = normalizePathname(pathname).split('/').filter(Boolean);

    if (segments[0] !== 'votes' || !segments[1]) {
        return null;
    }

    return decodeURIComponent(segments[1]);
};

const isPollPayload = (value: unknown): value is { pollName: string } =>
    typeof value === 'object' &&
    value !== null &&
    'pollName' in value &&
    typeof value.pollName === 'string';

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

        const payload: unknown = await response.json();

        if (!isPollPayload(payload)) {
            return null;
        }

        const pollTitle = payload.pollName.trim();

        return pollTitle ? pollTitle : null;
    } catch {
        return null;
    }
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

    const pollTitle = await fetchPollTitle({
        apiBaseUrl,
        fetchImpl,
        pollSlug,
        signal,
    });

    return buildVotePageSeo({
        origin: requestUrl.origin,
        pollPath: requestUrl.pathname,
        pollSlug,
        pollTitle,
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
