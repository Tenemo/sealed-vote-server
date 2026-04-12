import type {
    Browser,
    BrowserContext,
    BrowserContextOptions,
    BrowserType,
    Page,
    TestInfo,
    PlaywrightWorkerArgs,
} from '@playwright/test';

import { mobileFirefoxAndroidContextOptions } from './profiles';

const browserContextOptionKeys = [
    'acceptDownloads',
    'baseURL',
    'bypassCSP',
    'clientCertificates',
    'colorScheme',
    'deviceScaleFactor',
    'extraHTTPHeaders',
    'forcedColors',
    'geolocation',
    'hasTouch',
    'httpCredentials',
    'ignoreHTTPSErrors',
    'isMobile',
    'javaScriptEnabled',
    'locale',
    'offline',
    'permissions',
    'proxy',
    'recordHar',
    'recordVideo',
    'reducedMotion',
    'screen',
    'serviceWorkers',
    'storageState',
    'strictSelectors',
    'timezoneId',
    'userAgent',
    'viewport',
] as const satisfies ReadonlyArray<keyof BrowserContextOptions>;

type ManagedParticipant = {
    browser?: Browser;
    context: BrowserContext;
    page: Page;
};

export const getProjectContextOptions = (
    testInfo: TestInfo,
): BrowserContextOptions | undefined => {
    const projectUse = testInfo.project.use as Partial<BrowserContextOptions>;
    const contextEntries = browserContextOptionKeys.flatMap((optionKey) => {
        const optionValue = projectUse[optionKey];

        if (optionValue === undefined) {
            return [];
        }

        return [[optionKey, optionValue] as const];
    });
    const contextOptions = Object.fromEntries(
        contextEntries,
    ) as BrowserContextOptions;

    if (testInfo.project.name === 'mobile-firefox-android') {
        return {
            ...contextOptions,
            ...mobileFirefoxAndroidContextOptions,
        };
    }

    return Object.keys(contextOptions).length > 0 ? contextOptions : undefined;
};

export const openProjectParticipant = async (
    browser: Browser,
    testInfo: TestInfo,
): Promise<ManagedParticipant> => {
    const context = await browser.newContext(getProjectContextOptions(testInfo));
    const page = await context.newPage();

    return {
        context,
        page,
    };
};

export const reopenProjectParticipant = async ({
    browser,
    storageState,
    testInfo,
}: {
    browser: Browser;
    storageState: BrowserContextOptions['storageState'];
    testInfo: TestInfo;
}): Promise<ManagedParticipant> => {
    const context = await browser.newContext({
        ...(getProjectContextOptions(testInfo) ?? {}),
        storageState,
    });
    const page = await context.newPage();

    return {
        context,
        page,
    };
};

export const launchFirefoxParticipant = async ({
    playwright,
    mobile = false,
}: {
    playwright: PlaywrightWorkerArgs['playwright'];
    mobile?: boolean;
}): Promise<ManagedParticipant> => {
    const browserType: BrowserType = playwright.firefox;
    const browser = await browserType.launch();
    const context = await browser.newContext(
        mobile ? mobileFirefoxAndroidContextOptions : undefined,
    );
    const page = await context.newPage();

    return {
        browser,
        context,
        page,
    };
};

export const closeParticipant = async ({
    browser,
    context,
}: ManagedParticipant): Promise<void> => {
    if (browser) {
        await browser.close();
        return;
    }

    await context.close();
};
