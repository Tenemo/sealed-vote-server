import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

import {
    createVoteSocialImagePath,
    siteName,
    socialImageHeight,
    socialImageWidth,
    voteSocialImagePathPrefix,
} from './seoMetadata.mts';

type FetchLike = typeof fetch;

type VoteSocialImageRow = {
    kind: 'choice' | 'summary';
    label: string;
    scoreLabel?: string;
};

type VoteSocialImagePayload = {
    choices: string[];
    isComplete: boolean;
    isFallback: boolean;
    pollTitle: string | null;
    resultScores: number[];
};

type VoteSocialImageResponse = {
    body: Uint8Array;
    headers: Record<string, string>;
    isFallback: boolean;
};

const voteSocialImageChoicesLimit = 3;
const voteSocialImageTitleMaxLength = 72;
const voteSocialImageTitleLineLength = 24;
const voteSocialImageTitleMaxLines = 3;
const voteSocialImageChoiceMaxLength = 44;
const resolveVoteSocialImageFontPathFromModule = (): string | null => {
    try {
        return fileURLToPath(
            new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url),
        );
    } catch {
        return null;
    }
};
// Keep a bundled font for server-side social image rendering because Resvg
// runs with system fonts disabled for deterministic output.
const voteSocialImageFontPathCandidates = [
    path.resolve(process.cwd(), 'src', 'fonts', 'Roboto-Regular.ttf'),
    path.resolve(
        process.cwd(),
        'apps',
        'web',
        'src',
        'fonts',
        'Roboto-Regular.ttf',
    ),
    resolveVoteSocialImageFontPathFromModule(),
];
const voteSocialImageFontPath =
    voteSocialImageFontPathCandidates.find(
        (candidatePath): candidatePath is string =>
            candidatePath !== null && fs.existsSync(candidatePath),
    ) ||
    voteSocialImageFontPathCandidates.find(
        (candidatePath): candidatePath is string => candidatePath !== null,
    ) ||
    path.resolve(process.cwd(), 'src', 'fonts', 'Roboto-Regular.ttf');
const fallbackVoteSocialImageRows = [
    'Confidential browser voting',
    'Homomorphic encryption',
    'Public verification',
];
const longVoteSocialImageCacheControl = 'public, max-age=31536000, immutable';
const longVoteSocialImageCdnCacheControl =
    'public, durable, max-age=31536000, stale-while-revalidate=604800';
const shortVoteSocialImageCacheControl =
    'public, max-age=3600, stale-while-revalidate=600';
const shortVoteSocialImageCdnCacheControl =
    'public, durable, max-age=3600, stale-while-revalidate=600';

const normalizeWhitespace = (value: string): string =>
    value.trim().replace(/\s+/g, ' ');

const escapeXml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

const truncateText = (value: string, maxLength: number): string => {
    const normalizedValue = normalizeWhitespace(value);

    if (normalizedValue.length <= maxLength) {
        return normalizedValue;
    }

    if (maxLength <= 3) {
        return normalizedValue.slice(0, maxLength);
    }

    return `${normalizedValue.slice(0, maxLength - 3).trimEnd()}...`;
};

const hasVoteSocialImageResults = (resultScores: number[]): boolean =>
    resultScores.some((score) => Number.isFinite(score));

const formatVoteSocialImageScore = (score: number): string => score.toFixed(2);

export const wrapVoteSocialImageTitle = (title: string): string[] => {
    const normalizedTitle = truncateText(title, voteSocialImageTitleMaxLength);

    if (!normalizedTitle) {
        return [siteName];
    }

    const words = normalizedTitle.split(' ');
    const rawLines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        const candidateLine = currentLine ? `${currentLine} ${word}` : word;

        if (candidateLine.length <= voteSocialImageTitleLineLength) {
            currentLine = candidateLine;
            continue;
        }

        if (currentLine) {
            rawLines.push(currentLine);
            currentLine = word;
            continue;
        }

        rawLines.push(truncateText(word, voteSocialImageTitleLineLength));
    }

    if (currentLine) {
        rawLines.push(currentLine);
    }

    if (rawLines.length <= voteSocialImageTitleMaxLines) {
        return rawLines;
    }

    const visibleLines = rawLines.slice(0, voteSocialImageTitleMaxLines);
    const finalLineText = [
        visibleLines[voteSocialImageTitleMaxLines - 1],
        ...rawLines.slice(voteSocialImageTitleMaxLines),
    ].join(' ');

    visibleLines[voteSocialImageTitleMaxLines - 1] = truncateText(
        finalLineText,
        voteSocialImageTitleLineLength,
    );

    return visibleLines;
};

export const createVoteSocialImageRows = (
    choices: string[],
    resultScores: number[] = [],
): VoteSocialImageRow[] => {
    const normalizedChoiceSlots = choices.map((choice) =>
        normalizeWhitespace(choice),
    );
    const normalizedChoices = normalizedChoiceSlots.filter(Boolean);

    if (hasVoteSocialImageResults(resultScores)) {
        const visibleResults = normalizedChoiceSlots
            .map((choice, index) => ({
                choice,
                index,
                score: resultScores[index] ?? Number.NEGATIVE_INFINITY,
            }))
            .filter((entry) => entry.choice && Number.isFinite(entry.score))
            .sort((left, right) => {
                if (right.score !== left.score) {
                    return right.score - left.score;
                }

                return left.index - right.index;
            })
            .slice(0, voteSocialImageChoicesLimit)
            .map((entry) => ({
                kind: 'choice' as const,
                label: truncateText(
                    entry.choice,
                    voteSocialImageChoiceMaxLength,
                ),
                scoreLabel: formatVoteSocialImageScore(entry.score),
            }));

        const resultRows: VoteSocialImageRow[] = visibleResults.map(
            ({ kind, label, scoreLabel }) => ({
                kind,
                label,
                scoreLabel,
            }),
        );

        if (normalizedChoices.length > voteSocialImageChoicesLimit) {
            resultRows.push({
                kind: 'summary',
                label: `+${normalizedChoices.length - voteSocialImageChoicesLimit} more choices`,
            });
        }

        if (resultRows.length > 0) {
            return resultRows;
        }
    }

    const visibleChoices: VoteSocialImageRow[] = normalizedChoices
        .slice(0, voteSocialImageChoicesLimit)
        .map((choice) => ({
            kind: 'choice' as const,
            label: truncateText(choice, voteSocialImageChoiceMaxLength),
        }));

    if (normalizedChoices.length > voteSocialImageChoicesLimit) {
        visibleChoices.push({
            kind: 'summary',
            label: `+${normalizedChoices.length - voteSocialImageChoicesLimit} more`,
        });
    }

    if (visibleChoices.length > 0) {
        return visibleChoices;
    }

    return fallbackVoteSocialImageRows.map((choice) => ({
        kind: 'choice' as const,
        label: choice,
    }));
};

const createTitleTspans = (titleLines: string[]): string =>
    titleLines
        .map(
            (line, index) =>
                `<tspan x="72" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`,
        )
        .join('');

const createChoiceRowsSvg = (rows: VoteSocialImageRow[]): string =>
    rows
        .map((row, index) => {
            const y = 304 + index * 70;
            const badgeText = row.kind === 'choice' ? `${index + 1}` : '+';
            const rowFill = row.kind === 'choice' ? '#1c1c1c' : '#181818';
            const badgeFill = row.kind === 'choice' ? '#f2f2f2' : '#2d2d2d';
            const badgeTextFill = row.kind === 'choice' ? '#111111' : '#f2f2f2';
            const scoreText = row.scoreLabel
                ? `<text x="1086" y="${y + 36}" text-anchor="end" font-size="24" font-weight="700" fill="#ffffff">${escapeXml(row.scoreLabel)}</text>`
                : '';

            return `
                <rect x="72" y="${y}" width="1056" height="56" rx="8" fill="${rowFill}" stroke="#343434" />
                <rect x="92" y="${y + 12}" width="32" height="32" rx="6" fill="${badgeFill}" />
                <text x="108" y="${y + 34}" text-anchor="middle" font-size="18" font-weight="700" fill="${badgeTextFill}">${badgeText}</text>
                <text x="144" y="${y + 36}" font-size="26" fill="#f5f5f5">${escapeXml(row.label)}</text>
                ${scoreText}
            `;
        })
        .join('');

export const createVoteSocialImageSvg = ({
    choices,
    isComplete,
    pollTitle,
    resultScores,
}: VoteSocialImagePayload): string => {
    const titleLines = wrapVoteSocialImageTitle(pollTitle || siteName);
    const choiceRows = createVoteSocialImageRows(choices, resultScores);
    const sectionLabel = isComplete ? 'Final results' : 'Choices';
    const statusBadge = isComplete
        ? `
            <rect x="956" y="40" width="172" height="40" rx="8" fill="#1f1f1f" stroke="#353535" />
            <text x="1042" y="66" text-anchor="middle" font-size="20" font-weight="700" fill="#ffffff">Completed</text>
        `
        : '';

    return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${socialImageWidth}" height="${socialImageHeight}" viewBox="0 0 ${socialImageWidth} ${socialImageHeight}">
            <rect width="${socialImageWidth}" height="${socialImageHeight}" fill="#121212" />
            <rect x="0" y="96" width="${socialImageWidth}" height="1" fill="#303030" />
            <text x="72" y="72" font-size="54" font-weight="700" fill="#ffffff">${siteName}</text>
            ${statusBadge}
            <text x="72" y="176" font-size="72" font-weight="700" fill="#ffffff">${createTitleTspans(titleLines)}</text>
            <text x="72" y="274" font-size="24" fill="#8f8f8f">${sectionLabel}</text>
            ${createChoiceRowsSvg(choiceRows)}
        </svg>
    `;
};

const normalizePollChoices = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.map((choice) =>
              typeof choice === 'string' ? normalizeWhitespace(choice) : '',
          )
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

    return normalizedTitle ? normalizedTitle : null;
};

const normalizeVoteSocialImagePayload = (
    value: unknown,
): VoteSocialImagePayload | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const pollTitle = normalizePollTitle(
        (value as { pollName?: unknown }).pollName,
    );
    const resultScores = normalizePollScores(
        (value as { resultScores?: unknown }).resultScores,
    );

    if (!pollTitle) {
        return null;
    }

    return {
        choices: normalizePollChoices((value as { choices?: unknown }).choices),
        isComplete: hasVoteSocialImageResults(resultScores),
        isFallback: false,
        pollTitle,
        resultScores,
    };
};

export const extractVoteSocialImageSlugFromPathname = (
    pathname: string,
): string | null => {
    if (!pathname.startsWith(voteSocialImagePathPrefix)) {
        return null;
    }

    const encodedSlug = pathname
        .slice(voteSocialImagePathPrefix.length)
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

export const fetchVoteSocialImagePayload = async ({
    apiBaseUrl,
    fetchImpl = fetch,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<VoteSocialImagePayload | null> => {
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

        return normalizeVoteSocialImagePayload(await response.json());
    } catch {
        return null;
    }
};

export const renderVoteSocialImagePng = (
    payload: VoteSocialImagePayload,
): Uint8Array => {
    const svg = createVoteSocialImageSvg(payload);
    const resvg = new Resvg(svg, {
        fitTo: {
            mode: 'width',
            value: socialImageWidth,
        },
        font: {
            defaultFontFamily: 'Roboto',
            fontFiles: [voteSocialImageFontPath],
            loadSystemFonts: false,
        },
    });

    return resvg.render().asPng();
};

const createFallbackVoteSocialImagePayload = (): VoteSocialImagePayload => ({
    choices: [],
    isComplete: false,
    isFallback: true,
    pollTitle: null,
    resultScores: [],
});

export const renderVoteSocialImagePngWithFallback = ({
    payload,
    renderImpl = renderVoteSocialImagePng,
}: {
    payload: VoteSocialImagePayload;
    renderImpl?: (payload: VoteSocialImagePayload) => Uint8Array;
}): {
    body: Uint8Array;
    renderedPayload: VoteSocialImagePayload;
} => {
    try {
        return {
            body: renderImpl(payload),
            renderedPayload: payload,
        };
    } catch (renderError) {
        const fallbackPayload = createFallbackVoteSocialImagePayload();

        try {
            return {
                body: renderImpl(fallbackPayload),
                renderedPayload: fallbackPayload,
            };
        } catch (fallbackRenderError) {
            throw new Error(
                'Failed to render vote social image, including fallback image.',
                {
                    cause: {
                        fallbackRenderError,
                        renderError,
                    },
                },
            );
        }
    }
};

const buildVoteSocialImageHeaders = ({
    byteLength,
    isFallback,
}: {
    byteLength: number;
    isFallback: boolean;
}): Record<string, string> => ({
    'cache-control': isFallback
        ? shortVoteSocialImageCacheControl
        : longVoteSocialImageCacheControl,
    'content-length': byteLength.toString(),
    'content-type': 'image/png',
    'netlify-cdn-cache-control': isFallback
        ? shortVoteSocialImageCdnCacheControl
        : longVoteSocialImageCdnCacheControl,
});

export const createVoteSocialImageResponse = async ({
    apiBaseUrl,
    fetchImpl,
    pollSlug,
    signal,
}: {
    apiBaseUrl: string;
    fetchImpl?: FetchLike;
    pollSlug: string;
    signal?: AbortSignal;
}): Promise<VoteSocialImageResponse> => {
    const payload =
        (await fetchVoteSocialImagePayload({
            apiBaseUrl,
            fetchImpl,
            pollSlug,
            signal,
        })) || createFallbackVoteSocialImagePayload();
    const { body, renderedPayload } = renderVoteSocialImagePngWithFallback({
        payload,
    });

    return {
        body,
        headers: buildVoteSocialImageHeaders({
            byteLength: body.byteLength,
            isFallback: renderedPayload.isFallback,
        }),
        isFallback: renderedPayload.isFallback,
    };
};

export const createVoteSocialImageUrl = (
    origin: string,
    pollSlug: string,
): string => new URL(createVoteSocialImagePath(pollSlug), origin).toString();
