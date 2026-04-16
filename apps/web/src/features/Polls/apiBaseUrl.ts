const productionWebHostnames = new Set(['sealed.vote', 'www.sealed.vote']);
const netlifyDeployPreviewHostnamePattern =
    /^deploy-preview-\d+--sealed-vote\.netlify\.app$/;

const normalizeConfiguredApiBaseUrl = (configuredApiBaseUrl?: string): string =>
    configuredApiBaseUrl?.trim().replace(/\/+$/, '') ?? '';

export const shouldUseSameOriginApiProxy = (
    browserOrigin?: string,
): boolean => {
    if (!browserOrigin) {
        return false;
    }

    try {
        const parsedBrowserOrigin = new URL(browserOrigin);

        return (
            parsedBrowserOrigin.protocol === 'https:' &&
            (productionWebHostnames.has(parsedBrowserOrigin.hostname) ||
                netlifyDeployPreviewHostnamePattern.test(
                    parsedBrowserOrigin.hostname,
                ))
        );
    } catch {
        return false;
    }
};

export const resolveBrowserApiBaseUrl = ({
    browserOrigin,
    configuredApiBaseUrl,
}: {
    browserOrigin?: string;
    configuredApiBaseUrl?: string;
}): string => {
    if (shouldUseSameOriginApiProxy(browserOrigin)) {
        return '/';
    }

    return normalizeConfiguredApiBaseUrl(configuredApiBaseUrl) || '/';
};
