import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import {
    hasPublishedResultScores,
    orderPublishedPollResults,
} from './poll-results.mts';
import {
    siteName,
    socialImageWidth,
    pollSocialImagePathPrefix,
} from './seo-metadata.mts';

type FetchLike = typeof fetch;

type PollSocialImageVariant = 'complete' | 'open';

type PollSocialImageRenderPayload = {
    choices: string[];
    isComplete: boolean;
    pollTitle: string;
    resultScores: number[];
};

type PollSocialImagePayload = {
    choices: string[];
    pollTitle: string;
    resultScores: number[];
};

type PollSocialImageFetchResult =
    | {
          payload: PollSocialImagePayload;
          status: 'found';
      }
    | {
          status: 'not-found';
      }
    | {
          status: 'unavailable';
      };

type PollSocialImageResponse = {
    body: Uint8Array;
    headers: Record<string, string>;
    status: number;
};

type PollResultEntry = {
    label: string;
};

type MedalIconColors = {
    fill: string;
    ribbon: string;
    stroke: string;
};

type PodiumResultStyle = {
    iconMarkup: string;
    strokeColor: string;
};

type PollSocialImageCachePolicy = {
    browser: string;
    cdn: string;
    netlifyCdn: string;
};

const maxTitleLineLength = 16;
const maxTitleLines = 3;
const maxVisibleChoices = 4;
const maxVisibleResults = 4;
const maxChoiceLineWidth = 13.8;
const maxResultLineWidth = 13.2;
const ellipsis = '...';
const dayInSeconds = 60 * 60 * 24;
const hourInSeconds = 60 * 60;
const fontFileNames = ['Inter-Regular.ttf', 'Inter-Bold.ttf'] as const;

const successfulImageCachePolicy: PollSocialImageCachePolicy = {
    browser: 'public, max-age=0, must-revalidate',
    cdn: `public, max-age=${30 * dayInSeconds}, stale-while-revalidate=${30 * dayInSeconds}`,
    netlifyCdn: `public, durable, max-age=${30 * dayInSeconds}, stale-while-revalidate=${30 * dayInSeconds}`,
};

const notFoundImageCachePolicy: PollSocialImageCachePolicy = {
    browser: `public, max-age=${hourInSeconds}, stale-while-revalidate=${dayInSeconds}`,
    cdn: `public, max-age=${hourInSeconds}, stale-while-revalidate=${dayInSeconds}`,
    netlifyCdn: `public, durable, max-age=${hourInSeconds}, stale-while-revalidate=${dayInSeconds}`,
};

const unavailableImageCachePolicy: PollSocialImageCachePolicy = {
    browser: 'no-store',
    cdn: 'no-store',
    netlifyCdn: 'no-store',
};

const normalizeWhitespace = (value: string): string =>
    value.trim().replace(/\s+/g, ' ');

const escapeXml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const fitLineWithEllipsis = (value: string, maxLength: number): string => {
    if (maxLength <= ellipsis.length) {
        return ellipsis.slice(0, Math.max(maxLength, 0));
    }

    return `${value.slice(0, maxLength - ellipsis.length).trimEnd()}${ellipsis}`;
};

const truncateLine = (value: string, maxLength: number): string =>
    value.length <= maxLength ? value : fitLineWithEllipsis(value, maxLength);

const estimateCharacterWidth = (character: string): number => {
    if (character === ' ') {
        return 0.4;
    }

    if (/[.,'`:;|!ilI1-]/.test(character)) {
        return 0.52;
    }

    if (/[MWOQG@#%&0-9]/.test(character)) {
        return 1.2;
    }

    if (/[A-Z]/.test(character)) {
        return 1.08;
    }

    return 0.94;
};

const estimateVisualWidth = (value: string): number =>
    [...value].reduce(
        (totalWidth, character) =>
            totalWidth + estimateCharacterWidth(character),
        0,
    );

const truncateLineByVisualWidth = (value: string, maxWidth: number): string => {
    if (estimateVisualWidth(value) <= maxWidth) {
        return value;
    }

    const ellipsisWidth = estimateVisualWidth(ellipsis);
    const truncatedCharacters: string[] = [];
    let currentWidth = 0;

    for (const character of value) {
        const nextWidth = currentWidth + estimateCharacterWidth(character);

        if (nextWidth + ellipsisWidth > maxWidth) {
            break;
        }

        truncatedCharacters.push(character);
        currentWidth = nextWidth;
    }

    return `${truncatedCharacters.join('').trimEnd()}${ellipsis}`;
};

const ellipsizeLine = (value: string, maxLength: number): string => {
    if (value.length + ellipsis.length <= maxLength) {
        return `${value}${ellipsis}`;
    }

    return fitLineWithEllipsis(value, maxLength);
};

const wrapText = (
    value: string,
    maxLineLength: number,
    maxLines: number,
): string[] => {
    const words = normalizeWhitespace(value).split(/\s+/).filter(Boolean);

    if (!words.length) {
        return ['Untitled vote'];
    }

    const lines: string[] = [];
    let currentLine = '';
    let didTruncate = false;

    for (const word of words) {
        if (word.length > maxLineLength) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';

                if (lines.length === maxLines) {
                    didTruncate = true;
                    break;
                }
            }

            lines.push(truncateLine(word, maxLineLength));

            if (lines.length === maxLines) {
                didTruncate = true;
                break;
            }

            continue;
        }

        const nextLine = currentLine ? `${currentLine} ${word}` : word;

        if (nextLine.length <= maxLineLength) {
            currentLine = nextLine;
            continue;
        }

        if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            lines.push(truncateLine(word, maxLineLength));
        }

        if (lines.length === maxLines) {
            didTruncate = true;
            break;
        }
    }

    if (lines.length < maxLines && currentLine) {
        lines.push(currentLine);
    }

    if (
        lines.length === maxLines &&
        didTruncate &&
        !lines[maxLines - 1].endsWith(ellipsis)
    ) {
        lines[maxLines - 1] = ellipsizeLine(lines[maxLines - 1], maxLineLength);
    }

    return lines;
};

const hasPollSocialImageResults = hasPublishedResultScores;

const buildChoiceLines = (choiceNames: string[]): string[] => {
    const visibleChoices = choiceNames
        .slice(0, maxVisibleChoices)
        .map((choiceName) =>
            truncateLineByVisualWidth(choiceName, maxChoiceLineWidth),
        );

    if (choiceNames.length > maxVisibleChoices) {
        visibleChoices.push(`+${choiceNames.length - maxVisibleChoices} more`);
    }

    return visibleChoices.length ? visibleChoices : ['No choices yet'];
};

const buildResultEntries = (
    choiceNames: string[],
    resultScores: number[],
): PollResultEntry[] =>
    orderPublishedPollResults({
        choices: choiceNames,
        resultScores,
    })
        .slice(0, maxVisibleResults)
        .map(({ choiceName }) => ({
            label: truncateLineByVisualWidth(choiceName, maxResultLineWidth),
        }));

const buildGoldCupIcon =
    (): string => `<g transform="translate(8 9)" fill="none" stroke="#d6a72c" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5">
    <path d="M14 11h18v8c0 7-4 11-9 11s-9-4-9-11z" fill="#e7b83d" fill-opacity="0.22" />
    <path d="M14 14H9c0 5.5 2.6 8.5 6.9 8.5" />
    <path d="M32 14h5c0 5.5-2.6 8.5-6.9 8.5" />
    <path d="M23 30v7" />
    <path d="M16 37h14" />
</g>`;

const buildMedalIcon = (rank: 2 | 3, colors: MedalIconColors): string =>
    `<g transform="translate(10 8)">
    <path d="M10 3l7 13" fill="none" stroke="${colors.ribbon}" stroke-linecap="round" stroke-width="5" />
    <path d="M26 3l-7 13" fill="none" stroke="${colors.ribbon}" stroke-linecap="round" stroke-width="5" />
    <circle cx="18" cy="29" r="12" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="2.5" />
    <text x="18" y="34" fill="#1d1d1d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700" text-anchor="middle">${rank}</text>
</g>`;

const podiumResultStyles: PodiumResultStyle[] = [
    {
        iconMarkup: buildGoldCupIcon(),
        strokeColor: '#d6a72c',
    },
    {
        iconMarkup: buildMedalIcon(2, {
            fill: '#c8cdd2',
            ribbon: '#7c8790',
            stroke: '#eef1f4',
        }),
        strokeColor: '#bfc5ca',
    },
    {
        iconMarkup: buildMedalIcon(3, {
            fill: '#a9683d',
            ribbon: '#6f4930',
            stroke: '#d3915f',
        }),
        strokeColor: '#a9683d',
    },
];

const buildOpenVoteMarkup = (choiceNames: string[]): string => {
    const choiceLines = buildChoiceLines(choiceNames);
    const choiceCountLabel =
        choiceNames.length === 1 ? '1 choice' : `${choiceNames.length} choices`;
    const choicesMarkup = choiceLines
        .map(
            (line, index) =>
                `<g transform="translate(780 ${190 + index * 62})"><circle cx="12" cy="12" fill="#8f8f8f" r="6" /><text x="34" y="22" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="400">${escapeXml(line)}</text></g>`,
        )
        .join('');

    return `<text x="780" y="130" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">Choices</text>
    <text x="780" y="164" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="400">${escapeXml(choiceCountLabel)}</text>
    ${choicesMarkup}`;
};

const buildCompletedVoteMarkup = (
    choiceNames: string[],
    resultScores: number[],
): string => {
    const resultEntries = buildResultEntries(choiceNames, resultScores);
    const scoredChoiceCount = orderPublishedPollResults({
        choices: choiceNames,
        resultScores,
    }).length;
    const resultCountLabel =
        scoredChoiceCount === 1
            ? '1 scored choice'
            : `${scoredChoiceCount} scored choices`;

    if (!resultEntries.length) {
        return `<text x="780" y="130" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">Results</text>
    <text x="780" y="164" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="400">No scores submitted</text>
    <text x="780" y="248" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="600">No submitted scores</text>
    <text x="780" y="292" fill="#9f9f9f" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="400">This poll ended before anyone voted.</text>
    <text x="780" y="352" fill="#9f9f9f" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="400">${escapeXml(
        choiceNames.length === 1
            ? '1 choice was available.'
            : `${choiceNames.length} choices were available.`,
    )}</text>`;
    }

    const rowsMarkup = resultEntries
        .map(({ label }, resultIndex) => {
            const podiumStyle = podiumResultStyles[resultIndex];
            const rankMarkup =
                podiumStyle?.iconMarkup ??
                `<text x="24" y="41" fill="#8f8f8f" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700">${resultIndex + 1}</text>`;

            return `<g transform="translate(776 ${178 + resultIndex * 84})"><rect width="308" height="64" rx="18" fill="#202020" stroke="${podiumStyle?.strokeColor ?? '#2c2c2c'}" />${rankMarkup}<text x="64" y="41" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="600">${escapeXml(label)}</text></g>`;
        })
        .join('');
    const hiddenChoiceCount = scoredChoiceCount - resultEntries.length;
    const hiddenChoiceMarkup =
        hiddenChoiceCount > 0
            ? `<text x="780" y="534" fill="#9f9f9f" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="400">+${hiddenChoiceCount} more scored choices</text>`
            : '';

    return `<text x="780" y="130" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700">Results</text>
    <text x="780" y="164" fill="#a3a3a3" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="400">${escapeXml(resultCountLabel)}</text>
    ${rowsMarkup}
    ${hiddenChoiceMarkup}`;
};

export const createPollSocialImageSvg = ({
    choices,
    isComplete,
    pollTitle,
    resultScores,
}: PollSocialImageRenderPayload): string => {
    const titleStartY = 246;
    const titleLines = wrapText(pollTitle, maxTitleLineLength, maxTitleLines);
    const titleMarkup = titleLines
        .map(
            (line, index) =>
                `<text x="80" y="${titleStartY + index * 84}" fill="#f5f5f5" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="700">${escapeXml(line)}</text>`,
        )
        .join('');
    const panelMarkup = isComplete
        ? buildCompletedVoteMarkup(choices, resultScores)
        : buildOpenVoteMarkup(choices);
    const eyebrowLabel = isComplete ? 'Final results' : '1-10 score vote';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeXml(pollTitle)}">
    <defs>
        <linearGradient id="background" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="#101010" />
            <stop offset="100%" stop-color="#171717" />
        </linearGradient>
        <radialGradient id="accent" cx="78%" cy="12%" r="62%">
            <stop offset="0%" stop-color="#2f2f2f" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#2f2f2f" stop-opacity="0" />
        </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#background)" />
    <rect width="1200" height="630" fill="url(#accent)" />
    <text x="80" y="118" fill="#d4d4d4" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="600">${siteName}</text>
    <text x="80" y="168" fill="#9f9f9f" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="400">${eyebrowLabel}</text>
    <rect x="740" y="70" width="380" height="490" rx="28" fill="#1a1a1a" stroke="#2e2e2e" />
    ${titleMarkup}
    ${panelMarkup}
</svg>`;
};

const normalizePollChoices = (value: unknown): string[] =>
    Array.isArray(value)
        ? value
              .map((choice) =>
                  typeof choice === 'string' ? normalizeWhitespace(choice) : '',
              )
              .filter(Boolean)
        : [];

const normalizePollScores = (value: unknown): number[] =>
    Array.isArray(value)
        ? value.map((score) =>
              typeof score === 'number' && Number.isFinite(score)
                  ? score
                  : Number.NaN,
          )
        : [];

const normalizePollTitle = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const normalizedTitle = normalizeWhitespace(value);

    return normalizedTitle || null;
};

const normalizePollSocialImagePayload = (
    value: unknown,
): PollSocialImagePayload | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const pollTitle = normalizePollTitle(
        (value as { pollName?: unknown }).pollName,
    );

    if (!pollTitle) {
        return null;
    }

    return {
        choices: normalizePollChoices((value as { choices?: unknown }).choices),
        pollTitle,
        resultScores: normalizePollScores(
            (value as { resultScores?: unknown }).resultScores,
        ),
    };
};

export const extractPollSocialImageSlugFromPathname = (
    pathname: string,
): string | null => {
    if (!pathname.startsWith(pollSocialImagePathPrefix)) {
        return null;
    }

    const encodedSlug = pathname
        .slice(pollSocialImagePathPrefix.length)
        .replace(/\.png$/i, '');

    if (!encodedSlug || encodedSlug.includes('/')) {
        return null;
    }

    try {
        return decodeURIComponent(encodedSlug);
    } catch {
        return null;
    }
};

export const extractPollSocialImageVariantFromSearchParams = (
    searchParams: URLSearchParams,
): PollSocialImageVariant =>
    searchParams.get('v') === 'complete' ? 'complete' : 'open';

const fetchPollSocialImagePayload = async ({
    apiBaseUrl,
    fetchImpl = fetch,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<PollSocialImageFetchResult> => {
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

        if (response.status === 404) {
            return {
                status: 'not-found',
            };
        }

        if (!response.ok) {
            return {
                status: 'unavailable',
            };
        }

        const payload = normalizePollSocialImagePayload(await response.json());

        if (!payload) {
            return {
                status: 'unavailable',
            };
        }

        return {
            payload,
            status: 'found',
        };
    } catch {
        return {
            status: 'unavailable',
        };
    }
};

const getFontDirectoryCandidates = (): string[] => {
    const candidates = [
        path.resolve(process.cwd(), 'netlify', 'functions', 'assets', 'fonts'),
        path.resolve(
            process.cwd(),
            '..',
            '..',
            'netlify',
            'functions',
            'assets',
            'fonts',
        ),
    ];

    try {
        candidates.push(
            fileURLToPath(
                new URL(
                    '../../../netlify/functions/assets/fonts',
                    import.meta.url,
                ),
            ),
        );
    } catch {
        return candidates;
    }

    return candidates;
};

const resolveFontFiles = (): string[] | undefined => {
    for (const directory of getFontDirectoryCandidates()) {
        const fontFiles = fontFileNames.map((fontFileName) =>
            path.resolve(directory, fontFileName),
        );

        if (fontFiles.every((fontFile) => existsSync(fontFile))) {
            return fontFiles;
        }
    }

    return undefined;
};

const pollSocialImageFontFiles = resolveFontFiles();

const renderPollSocialImagePng = (
    payload: PollSocialImageRenderPayload,
): Uint8Array => {
    const svg = createPollSocialImageSvg(payload);
    const resvg = new Resvg(svg, {
        fitTo: {
            mode: 'width',
            value: socialImageWidth,
        },
        font: {
            defaultFontFamily: pollSocialImageFontFiles
                ? 'Inter'
                : 'sans-serif',
            ...(pollSocialImageFontFiles
                ? {
                      fontFiles: pollSocialImageFontFiles,
                      loadSystemFonts: false,
                      sansSerifFamily: 'Inter',
                  }
                : {
                      loadSystemFonts: true,
                      sansSerifFamily: 'sans-serif',
                  }),
        },
    });

    return resvg.render().asPng();
};

const createFallbackPollSocialImagePayload =
    (): PollSocialImageRenderPayload => ({
        choices: ['Share the link', 'Collect responses', 'Reveal results'],
        isComplete: false,
        pollTitle: siteName,
        resultScores: [],
    });

export const renderPollSocialImagePngWithFallback = ({
    payload,
    renderImpl = renderPollSocialImagePng,
}: {
    payload: PollSocialImageRenderPayload;
    renderImpl?: (payload: PollSocialImageRenderPayload) => Uint8Array;
}): {
    body: Uint8Array;
    renderedPayload: PollSocialImageRenderPayload;
} => {
    try {
        return {
            body: renderImpl(payload),
            renderedPayload: payload,
        };
    } catch (renderError) {
        const fallbackPayload = createFallbackPollSocialImagePayload();

        try {
            return {
                body: renderImpl(fallbackPayload),
                renderedPayload: fallbackPayload,
            };
        } catch (fallbackRenderError) {
            throw new AggregateError(
                [renderError, fallbackRenderError],
                'Failed to render poll social image, including fallback image.',
                {
                    cause: fallbackRenderError,
                },
            );
        }
    }
};

const buildPollSocialImageHeaders = ({
    byteLength,
    cachePolicy,
}: {
    byteLength: number;
    cachePolicy: PollSocialImageCachePolicy;
}): Record<string, string> => ({
    'cache-control': cachePolicy.browser,
    'cdn-cache-control': cachePolicy.cdn,
    'content-length': byteLength.toString(),
    'content-type': 'image/png',
    'netlify-cdn-cache-control': cachePolicy.netlifyCdn,
});

export const createPollSocialImagePayloadForVariant = ({
    payload,
    variant,
}: {
    payload: PollSocialImagePayload;
    variant: PollSocialImageVariant;
}): PollSocialImageRenderPayload => {
    const isComplete =
        variant === 'complete' &&
        hasPollSocialImageResults(payload.resultScores);

    return {
        choices: payload.choices,
        isComplete,
        pollTitle: payload.pollTitle,
        resultScores: isComplete ? payload.resultScores : [],
    };
};

export const createPollSocialImageResponse = async ({
    apiBaseUrl,
    fetchImpl,
    pollSlug,
    signal,
    variant,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
    variant: PollSocialImageVariant;
}): Promise<PollSocialImageResponse> => {
    const pollSocialImageResult = await fetchPollSocialImagePayload({
        apiBaseUrl,
        fetchImpl,
        pollSlug,
        signal,
    });

    if (pollSocialImageResult.status === 'not-found') {
        const { body } = renderPollSocialImagePngWithFallback({
            payload: {
                choices: [
                    'Share the link',
                    'Collect responses',
                    'Reveal results',
                ],
                isComplete: false,
                pollTitle: 'Poll not found',
                resultScores: [],
            },
        });

        return {
            body,
            headers: buildPollSocialImageHeaders({
                byteLength: body.byteLength,
                cachePolicy: notFoundImageCachePolicy,
            }),
            status: 200,
        };
    }

    if (pollSocialImageResult.status === 'unavailable') {
        const { body } = renderPollSocialImagePngWithFallback({
            payload: {
                choices: ['Try again shortly'],
                isComplete: false,
                pollTitle: 'Poll unavailable',
                resultScores: [],
            },
        });

        return {
            body,
            headers: buildPollSocialImageHeaders({
                byteLength: body.byteLength,
                cachePolicy: unavailableImageCachePolicy,
            }),
            status: 503,
        };
    }

    const { body } = renderPollSocialImagePngWithFallback({
        payload: createPollSocialImagePayloadForVariant({
            payload: pollSocialImageResult.payload,
            variant,
        }),
    });

    return {
        body,
        headers: buildPollSocialImageHeaders({
            byteLength: body.byteLength,
            cachePolicy: successfulImageCachePolicy,
        }),
        status: 200,
    };
};
