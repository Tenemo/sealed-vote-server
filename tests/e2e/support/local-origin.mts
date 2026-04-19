const loopbackIpv4HostnamePattern = /^127(?:\.\d{1,3}){3}$/u;

export const isLocalLoopbackHostname = (hostname: string): boolean =>
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    loopbackIpv4HostnamePattern.test(hostname);
