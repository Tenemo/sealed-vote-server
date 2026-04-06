import type {
    Browser,
    BrowserContext,
    BrowserContextOptions,
    BrowserType,
    Page,
    Playwright,
    TestInfo,
} from '@playwright/test';

const mobileFirefoxAndroidUserAgent =
    'Mozilla/5.0 (Android 14; Mobile; rv:137.0) Gecko/137.0 Firefox/137.0';

export const mobileFirefoxAndroidContextOptions: BrowserContextOptions = {
    hasTouch: true,
    userAgent: mobileFirefoxAndroidUserAgent,
    viewport: {
        width: 412,
        height: 915,
    },
};

type ManagedParticipant = {
    browser?: Browser;
    context: BrowserContext;
    page: Page;
};

export const getProjectContextOptions = (
    testInfo: TestInfo,
): BrowserContextOptions | undefined =>
    testInfo.project.name === 'mobile-firefox-android'
        ? mobileFirefoxAndroidContextOptions
        : undefined;

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
