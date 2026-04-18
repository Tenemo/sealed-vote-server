const loopbackIpv4HostnamePattern = /^127(?:\.\d{1,3}){3}$/u;

export const isLocalLoopbackHostname = (hostname: string): boolean =>
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    loopbackIpv4HostnamePattern.test(hostname);

export const isLocalLoopbackUrl = (value: string): boolean => {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(value);
    } catch {
        return false;
    }

    return (
        (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
        isLocalLoopbackHostname(parsedUrl.hostname)
    );
};
