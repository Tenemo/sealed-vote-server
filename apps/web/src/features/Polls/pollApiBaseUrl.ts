export const normalizePollApiBaseUrl = (
    configuredApiBaseUrl: string | null | undefined,
): string => {
    const normalizedApiBaseUrl = configuredApiBaseUrl
        ? configuredApiBaseUrl.trim().replace(/\/+$/, '')
        : '';

    return normalizedApiBaseUrl || '/';
};
