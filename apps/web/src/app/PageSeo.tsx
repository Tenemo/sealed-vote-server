import React from 'react';
import { Helmet } from 'react-helmet-async';

import {
    serializeStructuredData,
    siteAuthor,
    siteLocale,
    siteName,
    siteThemeColor,
    type SeoMetadata,
} from './seo';

const PageSeo = ({
    metadata,
}: {
    metadata: SeoMetadata;
}): React.JSX.Element => (
    <Helmet prioritizeSeoTags>
        <title>{metadata.title}</title>
        <meta content={siteAuthor} name="author" />
        <meta content={siteName} name="application-name" />
        <meta content={siteName} name="apple-mobile-web-app-title" />
        <meta content="dark" name="color-scheme" />
        <meta content={metadata.description} name="description" />
        <meta content="telephone=no" name="format-detection" />
        <meta content={metadata.keywords} name="keywords" />
        <meta content={metadata.robots} name="robots" />
        <meta content={siteThemeColor} name="theme-color" />
        <meta content={metadata.url} name="twitter:url" />
        <meta content={metadata.imageAlt} name="twitter:image:alt" />
        <meta content={metadata.imageUrl} name="twitter:image" />
        <meta content={metadata.description} name="twitter:description" />
        <meta content={metadata.title} name="twitter:title" />
        <meta content="summary_large_image" name="twitter:card" />
        <meta content={siteName} property="og:site_name" />
        <meta content={metadata.description} property="og:description" />
        <meta content={metadata.imageAlt} property="og:image:alt" />
        <meta
            content={metadata.imageHeight.toString()}
            property="og:image:height"
        />
        <meta content={metadata.imageUrl} property="og:image" />
        <meta content={metadata.imageUrl} property="og:image:secure_url" />
        <meta content={metadata.imageType} property="og:image:type" />
        <meta
            content={metadata.imageWidth.toString()}
            property="og:image:width"
        />
        <meta content={siteLocale} property="og:locale" />
        <meta content={metadata.title} property="og:title" />
        <meta content="website" property="og:type" />
        <meta content={metadata.url} property="og:url" />
        <link href={metadata.canonicalUrl} rel="canonical" />
        {metadata.structuredData.map((structuredData, index) => (
            <script key={index} type="application/ld+json">
                {serializeStructuredData(structuredData)}
            </script>
        ))}
    </Helmet>
);

export default PageSeo;
