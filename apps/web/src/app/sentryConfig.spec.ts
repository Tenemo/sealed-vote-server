import {
    resolveSentryEnabled,
    resolveSentryReplayEnabled,
} from './sentryConfig';

describe('resolveSentryEnabled', () => {
    it('disables Sentry in development mode', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: 'https://api.sealed.vote',
                configuredValue: undefined,
                currentHostname: 'sealed.vote',
                currentOrigin: 'https://sealed.vote',
                mode: 'development',
            }),
        ).toBe(false);
    });

    it('disables Sentry for local relative api URLs', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: '/',
                configuredValue: undefined,
                currentHostname: 'localhost',
                currentOrigin: 'http://localhost:3000',
                mode: 'production',
            }),
        ).toBe(false);
    });

    it('disables Sentry for loopback API hosts', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: 'https://localhost:4000',
                configuredValue: undefined,
                currentHostname: 'sealed.vote',
                currentOrigin: 'https://sealed.vote',
                mode: 'production',
            }),
        ).toBe(false);
    });

    it('disables Sentry for IPv6 loopback hosts', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: 'http://[::1]:4000',
                configuredValue: undefined,
                currentHostname: '::1',
                currentOrigin: 'http://[::1]:3000',
                mode: 'production',
            }),
        ).toBe(false);
    });

    it('enables Sentry for non-local production environments', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: 'https://api.sealed.vote',
                configuredValue: undefined,
                currentHostname: 'sealed.vote',
                currentOrigin: 'https://sealed.vote',
                mode: 'production',
            }),
        ).toBe(true);
    });

    it('allows explicit overrides', () => {
        expect(
            resolveSentryEnabled({
                apiBaseUrl: '/',
                configuredValue: 'true',
                currentHostname: 'localhost',
                currentOrigin: 'http://localhost:3000',
                mode: 'production',
            }),
        ).toBe(true);

        expect(
            resolveSentryEnabled({
                apiBaseUrl: 'https://api.sealed.vote',
                configuredValue: 'false',
                currentHostname: 'sealed.vote',
                currentOrigin: 'https://sealed.vote',
                mode: 'production',
            }),
        ).toBe(false);
    });
});

describe('resolveSentryReplayEnabled', () => {
    it('disables replay in automated browsers by default', () => {
        expect(
            resolveSentryReplayEnabled({
                configuredValue: undefined,
                isAutomatedBrowser: true,
            }),
        ).toBe(false);
    });

    it('enables replay for regular browsers by default', () => {
        expect(
            resolveSentryReplayEnabled({
                configuredValue: undefined,
                isAutomatedBrowser: false,
            }),
        ).toBe(true);
    });

    it('allows explicit replay overrides', () => {
        expect(
            resolveSentryReplayEnabled({
                configuredValue: 'true',
                isAutomatedBrowser: true,
            }),
        ).toBe(true);

        expect(
            resolveSentryReplayEnabled({
                configuredValue: 'false',
                isAutomatedBrowser: false,
            }),
        ).toBe(false);
    });
});
