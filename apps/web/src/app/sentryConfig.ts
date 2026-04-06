const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const normalizeConfiguredSentryValue = (
    configuredValue: string | undefined,
): string | undefined => configuredValue?.trim().toLowerCase();

const isLoopbackHostname = (hostname: string): boolean =>
    loopbackHostnames.has(hostname.toLowerCase());

const resolveApiHostname = (
    apiBaseUrl: string,
    currentOrigin: string,
): string | null => {
    try {
        const resolvedApiUrl = new URL(apiBaseUrl, currentOrigin);
        return resolvedApiUrl.hostname;
    } catch {
        return null;
    }
};

export const resolveSentryEnabled = ({
    apiBaseUrl,
    configuredValue,
    currentHostname,
    currentOrigin,
    mode,
}: {
    apiBaseUrl: string;
    configuredValue: string | undefined;
    currentHostname: string;
    currentOrigin: string;
    mode: string;
}): boolean => {
    const normalizedConfiguredValue =
        normalizeConfiguredSentryValue(configuredValue);

    if (normalizedConfiguredValue === 'true') {
        return true;
    }

    if (normalizedConfiguredValue === 'false') {
        return false;
    }

    if (mode === 'development' || mode === 'test') {
        return false;
    }

    if (isLoopbackHostname(currentHostname)) {
        return false;
    }

    const apiHostname = resolveApiHostname(apiBaseUrl, currentOrigin);

    if (apiHostname && isLoopbackHostname(apiHostname)) {
        return false;
    }

    return true;
};
