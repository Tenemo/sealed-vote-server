const normalizeConfiguredApiBaseUrl = (configuredApiBaseUrl?: string): string =>
    configuredApiBaseUrl?.trim().replace(/\/+$/, '') ?? '';

export const resolveBrowserApiBaseUrl = ({
    configuredApiBaseUrl,
}: {
    configuredApiBaseUrl?: string;
}): string => normalizeConfiguredApiBaseUrl(configuredApiBaseUrl) || '/';
