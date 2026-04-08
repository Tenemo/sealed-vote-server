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
export const socialImageWidth = 1200;
export const socialImageHeight = 630;
export const homePageDescription =
    'Confidential 1-10 score voting in the browser, with homomorphic encryption, offline recovery, and public verification of the published final result.';
export const votePageFallbackDescription =
    'Confidential participant vote page on sealed.vote.';

type StructuredData = Record<string, unknown>;

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

const createImageObject = (origin: string): StructuredData => {
    const imageUrl = createAbsoluteUrl(origin, socialImagePath);

    return {
        '@type': 'ImageObject',
        '@id': `${origin}/#social-image`,
        caption: socialImageAlt,
        contentUrl: imageUrl,
        height: {
            '@type': 'QuantitativeValue',
            unitText: 'px',
            value: socialImageHeight,
        },
        url: imageUrl,
        width: {
            '@type': 'QuantitativeValue',
            unitText: 'px',
            value: socialImageWidth,
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
): StructuredData => ({
    '@type': 'WebApplication',
    '@id': `${origin}/#webapp`,
    applicationCategory: 'SecurityApplication',
    browserRequirements: 'JavaScript required',
    description,
    image: createAbsoluteUrl(origin, socialImagePath),
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
    name: string,
): StructuredData => ({
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    description,
    image: {
        '@id': `${origin}/#social-image`,
    },
    inLanguage: 'en',
    isPartOf: {
        '@id': `${origin}/#website`,
    },
    name,
    primaryImageOfPage: {
        '@id': `${origin}/#social-image`,
    },
    url,
});

const buildStructuredData = (
    origin: string,
    url: string,
    description: string,
    pageName: string,
): StructuredData[] => [
    createWebSiteObject(origin, description),
    createWebPageObject(origin, url, description, pageName),
    createWebApplicationObject(origin, url, description),
    createImageObject(origin),
];

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

    return `Join the confidential vote "${normalizedPollTitle}" on sealed.vote. Score each choice from 1 to 10 in the browser with homomorphic encryption, offline recovery, and public verification.`;
};

export const buildVotePageSeo = ({
    origin,
    pollPath,
    pollTitle,
}: {
    origin?: string;
    pollPath: string;
    pollTitle?: string | null;
}): SeoMetadata => {
    const normalizedOrigin = normalizeOrigin(origin);
    const normalizedPollTitle = pollTitle?.trim() || null;
    const url = createAbsoluteUrl(normalizedOrigin, pollPath);
    const description = createVotePageDescription(normalizedPollTitle);
    const title = normalizedPollTitle
        ? `${normalizedPollTitle} | ${siteName}`
        : `Vote | ${siteName}`;

    return {
        canonicalUrl: url,
        description,
        imageAlt: socialImageAlt,
        imageHeight: socialImageHeight,
        imageType: 'image/png',
        imageUrl: createAbsoluteUrl(normalizedOrigin, socialImagePath),
        imageWidth: socialImageWidth,
        keywords: defaultKeywords,
        robots: 'noindex, nofollow, noarchive',
        structuredData: buildStructuredData(
            normalizedOrigin,
            url,
            description,
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
