export const seoMarkerStartName = 'sealed-vote-seo-start';
export const seoMarkerEndName = 'sealed-vote-seo-end';

export const siteName = 'sealed.vote';
export const siteAuthor = 'piotr@piech.dev';
export const siteOrigin = 'https://sealed.vote';
export const siteThemeColor = '#121212';
export const siteLocale = 'en_US';
export const defaultKeywords =
    'confidential voting, secure voting, score voting, homomorphic encryption, threshold cryptography, elgamal, offline recovery, public verification';
export const socialImagePath = '/social/og-home.png';
export const socialImageAlt =
    'sealed.vote homepage showing the vote creation interface.';
export const voteSocialImagePathPrefix = '/social/votes/';
export const socialImageWidth = 1200;
export const socialImageHeight = 630;
export const homePageDescription =
    'Confidential 1-10 score voting in the browser, with homomorphic encryption, offline recovery, and public verification of the published final result.';
export const votePageFallbackDescription =
    'Confidential participant vote page on sealed.vote.';

type StructuredData = Record<string, unknown>;

type SeoImage = {
    alt: string;
    height: number;
    type: string;
    url: string;
    width: number;
};

export type SeoMetadata = {
    canonicalUrl: string;
    description: string;
    imageAlt: string;
    imageHeight: number;
    imageType: string;
    imageUrl: string;
    imageWidth: number;
    keywords: string;
    robots: string;
    structuredData: StructuredData[];
    title: string;
    url: string;
};

const normalizeVoteSocialImageVersion = (
    imageVersion: string | null | undefined,
): string | null => {
    const normalizedImageVersion = imageVersion?.trim() || null;

    return normalizedImageVersion ? normalizedImageVersion : null;
};

const hashVoteSocialImageVersion = (value: string): string => {
    let hash = 0x811c9dc5;

    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }

    return (hash >>> 0).toString(36);
};

const normalizeVoteSocialImageScores = (value: unknown): number[] =>
    Array.isArray(value)
        ? value.filter(
              (score): score is number =>
                  typeof score === 'number' && Number.isFinite(score),
          )
        : [];

const normalizeVoteSocialImageTallies = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter(
              (tally): tally is string =>
                  typeof tally === 'string' && tally.trim().length > 0,
          )
        : [];

export const createVoteSocialImageVersion = ({
    resultScores,
    resultTallies,
}: {
    resultScores?: unknown;
    resultTallies?: unknown;
}): string | null => {
    const normalizedTallies = normalizeVoteSocialImageTallies(resultTallies);

    if (normalizedTallies.length > 0) {
        return `results-${hashVoteSocialImageVersion(
            `t:${normalizedTallies.join('|')}`,
        )}`;
    }

    const normalizedScores = normalizeVoteSocialImageScores(resultScores);

    if (normalizedScores.length === 0) {
        return null;
    }

    return `results-${hashVoteSocialImageVersion(
        `s:${normalizedScores.map((score) => score.toFixed(6)).join('|')}`,
    )}`;
};

export const createVoteSocialImagePath = (
    pollSlug: string,
    imageVersion?: string | null,
): string => {
    const pathname = `${voteSocialImagePathPrefix}${encodeURIComponent(pollSlug)}.png`;
    const normalizedImageVersion =
        normalizeVoteSocialImageVersion(imageVersion);

    if (!normalizedImageVersion) {
        return pathname;
    }

    return `${pathname}?v=${encodeURIComponent(normalizedImageVersion)}`;
};

export const createVoteSocialImageAlt = (
    pollTitle: string | null | undefined,
    isComplete?: boolean,
): string => {
    const normalizedPollTitle = pollTitle?.trim() || null;

    if (!normalizedPollTitle) {
        return socialImageAlt;
    }

    return isComplete
        ? `Results image for "${normalizedPollTitle}" on sealed.vote.`
        : `Preview image for "${normalizedPollTitle}" on sealed.vote.`;
};

const normalizeOrigin = (origin: string | undefined): string => {
    const trimmedOrigin = origin?.trim();

    if (!trimmedOrigin) {
        return siteOrigin;
    }

    const parsedOrigin = new URL(trimmedOrigin);

    return parsedOrigin.origin;
};

const createAbsoluteUrl = (origin: string, pathname: string): string =>
    new URL(pathname, origin).toString();

const escapeHtml = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');

export const serializeStructuredData = (value: unknown): string =>
    JSON.stringify(value)
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026');

const createImageObject = ({
    alt,
    height,
    url,
    width,
}: SeoImage): StructuredData => {
    return {
        '@type': 'ImageObject',
        caption: alt,
        contentUrl: url,
        height: {
            '@type': 'QuantitativeValue',
            unitText: 'px',
            value: height,
        },
        url,
        width: {
            '@type': 'QuantitativeValue',
            unitText: 'px',
            value: width,
        },
    };
};

const createWebSiteObject = (
    origin: string,
    description: string,
): StructuredData => ({
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    description,
    inLanguage: 'en',
    name: siteName,
    url: `${origin}/`,
});

const createWebApplicationObject = (
    origin: string,
    url: string,
    description: string,
    imageUrl: string,
): StructuredData => ({
    '@type': 'WebApplication',
    '@id': `${origin}/#webapp`,
    applicationCategory: 'SecurityApplication',
    browserRequirements: 'JavaScript required',
    description,
    image: imageUrl,
    inLanguage: 'en',
    isPartOf: {
        '@id': `${origin}/#website`,
    },
    name: siteName,
    operatingSystem: 'Any',
    url,
});

const createWebPageObject = (
    origin: string,
    url: string,
    description: string,
    imageId: string,
    name: string,
): StructuredData => ({
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    description,
    image: {
        '@id': imageId,
    },
    inLanguage: 'en',
    isPartOf: {
        '@id': `${origin}/#website`,
    },
    name,
    primaryImageOfPage: {
        '@id': imageId,
    },
    url,
});

const buildStructuredData = (
    origin: string,
    url: string,
    description: string,
    image: SeoImage,
    pageName: string,
): StructuredData[] => [
    createWebSiteObject(origin, description),
    createWebPageObject(
        origin,
        url,
        description,
        `${url}#social-image`,
        pageName,
    ),
    createWebApplicationObject(origin, url, description, image.url),
    {
        ...createImageObject(image),
        '@id': `${url}#social-image`,
    },
];

const createVotePageImageUrl = (
    origin: string,
    pollSlug: string | null,
    imageVersion: string | null,
): string =>
    pollSlug
        ? createAbsoluteUrl(
              origin,
              createVoteSocialImagePath(pollSlug, imageVersion),
          )
        : createAbsoluteUrl(origin, socialImagePath);

export const buildHomePageSeo = ({
    origin,
    pathname = '/',
}: {
    origin?: string;
    pathname?: string;
} = {}): SeoMetadata => {
    const normalizedOrigin = normalizeOrigin(origin);
    const url = createAbsoluteUrl(normalizedOrigin, pathname);

    return {
        canonicalUrl: url,
        description: homePageDescription,
        imageAlt: socialImageAlt,
        imageHeight: socialImageHeight,
        imageType: 'image/png',
        imageUrl: createAbsoluteUrl(normalizedOrigin, socialImagePath),
        imageWidth: socialImageWidth,
        keywords: defaultKeywords,
        robots: 'index, follow',
        structuredData: buildStructuredData(
            normalizedOrigin,
            url,
            homePageDescription,
            {
                alt: socialImageAlt,
                height: socialImageHeight,
                type: 'image/png',
                url: createAbsoluteUrl(normalizedOrigin, socialImagePath),
                width: socialImageWidth,
            },
            siteName,
        ),
        title: siteName,
        url,
    };
};

const createVotePageDescription = (pollTitle: string | null): string => {
    const normalizedPollTitle = pollTitle?.trim() || null;

    if (!normalizedPollTitle) {
        return votePageFallbackDescription;
    }

    return `Join the confidential vote "${normalizedPollTitle}" on sealed.vote. Score each choice from 1 to 10 in the browser with homomorphic encryption and public verification.`;
};

export const buildVotePageSeo = ({
    origin,
    pollPath,
    pollSlug,
    resultScores,
    resultTallies,
    pollTitle,
}: {
    origin?: string;
    pollPath: string;
    pollSlug?: string | null;
    resultScores?: unknown;
    resultTallies?: unknown;
    pollTitle?: string | null;
}): SeoMetadata => {
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedPollSlug = pollSlug?.trim() || null;
    const normalizedPollTitle = pollTitle?.trim() || null;
    const imageVersion = createVoteSocialImageVersion({
        resultScores,
        resultTallies,
    });
    const url = createAbsoluteUrl(normalizedOrigin, pollPath);
    const description = createVotePageDescription(normalizedPollTitle);
    const imageAlt = createVoteSocialImageAlt(
        normalizedPollTitle,
        imageVersion !== null,
    );
    const imageUrl = createVotePageImageUrl(
        normalizedOrigin,
        normalizedPollSlug,
        imageVersion,
    );
    const title = normalizedPollTitle
        ? `${normalizedPollTitle} | ${siteName}`
        : `Vote | ${siteName}`;

    return {
        canonicalUrl: url,
        description,
        imageAlt,
        imageHeight: socialImageHeight,
        imageType: 'image/png',
        imageUrl,
        imageWidth: socialImageWidth,
        keywords: defaultKeywords,
        robots: 'noindex, nofollow, noarchive',
        structuredData: buildStructuredData(
            normalizedOrigin,
            url,
            description,
            {
                alt: imageAlt,
                height: socialImageHeight,
                type: 'image/png',
                url: imageUrl,
                width: socialImageWidth,
            },
            normalizedPollTitle || title,
        ),
        title,
        url,
    };
};

const renderMetaTag = (
    name: string,
    content: string,
    attribute: 'name' | 'property' = 'name',
): string =>
    `<meta ${attribute}="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;

const renderLinkTag = (rel: string, href: string): string =>
    `<link rel="${escapeHtml(rel)}" href="${escapeHtml(href)}" />`;

const renderJsonLdScript = (structuredData: StructuredData): string =>
    `<script type="application/ld+json">${serializeStructuredData(structuredData)}</script>`;

export const renderSeoBlock = (metadata: SeoMetadata): string =>
    [
        `<meta name="${seoMarkerStartName}" content="1" />`,
        renderMetaTag('author', siteAuthor),
        renderMetaTag('application-name', siteName),
        renderMetaTag('apple-mobile-web-app-title', siteName),
        renderMetaTag('color-scheme', 'dark'),
        renderMetaTag('description', metadata.description),
        renderMetaTag('format-detection', 'telephone=no'),
        renderMetaTag('keywords', metadata.keywords),
        renderMetaTag('robots', metadata.robots),
        renderMetaTag('theme-color', siteThemeColor),
        renderMetaTag('og:site_name', siteName, 'property'),
        renderMetaTag('og:title', metadata.title, 'property'),
        renderMetaTag('og:description', metadata.description, 'property'),
        renderMetaTag('og:type', 'website', 'property'),
        renderMetaTag('og:url', metadata.url, 'property'),
        renderMetaTag('og:image', metadata.imageUrl, 'property'),
        renderMetaTag('og:image:secure_url', metadata.imageUrl, 'property'),
        renderMetaTag('og:image:type', metadata.imageType, 'property'),
        renderMetaTag(
            'og:image:width',
            metadata.imageWidth.toString(),
            'property',
        ),
        renderMetaTag(
            'og:image:height',
            metadata.imageHeight.toString(),
            'property',
        ),
        renderMetaTag('og:image:alt', metadata.imageAlt, 'property'),
        renderMetaTag('og:locale', siteLocale, 'property'),
        renderMetaTag('twitter:card', 'summary_large_image'),
        renderMetaTag('twitter:title', metadata.title),
        renderMetaTag('twitter:description', metadata.description),
        renderMetaTag('twitter:url', metadata.url),
        renderMetaTag('twitter:image', metadata.imageUrl),
        renderMetaTag('twitter:image:alt', metadata.imageAlt),
        renderLinkTag('canonical', metadata.canonicalUrl),
        `<title>${escapeHtml(metadata.title)}</title>`,
        ...metadata.structuredData.map(renderJsonLdScript),
        `<meta name="${seoMarkerEndName}" content="1" />`,
    ].join('\n');

const findMarker = (html: string, pattern: RegExp): RegExpExecArray => {
    const match = pattern.exec(html);

    if (!match || match.index === undefined) {
        throw new Error('SEO markers are missing from index.html.');
    }

    return match;
};

export const injectSeoIntoHtml = (
    html: string,
    metadata: SeoMetadata,
): string => {
    const startMatch = findMarker(
        html,
        /<meta\s+name=["']sealed-vote-seo-start["'][^>]*>/i,
    );
    const endMatch = findMarker(
        html,
        /<meta\s+name=["']sealed-vote-seo-end["'][^>]*>/i,
    );
    const endIndex = endMatch.index + endMatch[0].length;

    if (startMatch.index >= endMatch.index) {
        throw new Error('SEO markers are out of order in index.html.');
    }

    return `${html.slice(0, startMatch.index)}${renderSeoBlock(metadata)}${html.slice(endIndex)}`;
};
