export const resolveBrowserApiBaseUrl = ({
    configuredApiBaseUrl,
}: {
    configuredApiBaseUrl?: string | null;
}): string => {
    const normalizedConfiguredApiBaseUrl = configuredApiBaseUrl?.trim();

    if (!normalizedConfiguredApiBaseUrl) {
        return '/';
    }

    return normalizedConfiguredApiBaseUrl.replace(/\/+$/, '') || '/';
};
