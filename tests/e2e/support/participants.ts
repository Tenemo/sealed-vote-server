import type {
    Browser,
    BrowserContext,
    BrowserContextOptions,
    BrowserType,
    Page,
    Playwright,
    TestInfo,
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
    const contextOptions: BrowserContextOptions = {};
    const projectUse = testInfo.project.use as Partial<BrowserContextOptions>;

    for (const optionKey of browserContextOptionKeys) {
        const optionValue = projectUse[optionKey];

        if (optionValue !== undefined) {
            contextOptions[optionKey] = optionValue;
        }
    }

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

export const launchFirefoxParticipant = async ({
    playwright,
    mobile = false,
}: {
    playwright: Playwright;
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
    await context.close();
    if (browser) {
        await browser.close();
    }
};
