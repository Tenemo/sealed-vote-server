import type {
    Browser,
    BrowserContext,
    BrowserContextOptions,
    Page,
    TestInfo,
} from '@playwright/test';

import { mobileFirefoxAndroidContextOptions } from './profiles.mts';

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
    closeMode?: 'context' | 'page-only';
    context: BrowserContext;
    closePromise?: Promise<void>;
    isClosed: boolean;
    page: Page;
};

const createManagedParticipant = ({
    browser,
    closeMode,
    context,
    page,
}: {
    browser?: Browser;
    closeMode?: ManagedParticipant['closeMode'];
    context: BrowserContext;
    page: Page;
}): ManagedParticipant => ({
    browser,
    closeMode,
    context,
    isClosed: false,
    page,
});

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
    const context = await browser.newContext(
        getProjectContextOptions(testInfo),
    );
    const page = await context.newPage();

    return createManagedParticipant({
        closeMode: 'context',
        context,
        page,
    });
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

    return createManagedParticipant({
        closeMode: 'context',
        context,
        page,
    });
};

export const closeParticipant = async (
    participant: ManagedParticipant,
): Promise<void> => {
    if (participant.isClosed) {
        return;
    }

    if (participant.closePromise) {
        await participant.closePromise;
        return;
    }

    participant.closePromise = (async () => {
        if (participant.browser) {
            if (participant.browser.isConnected()) {
                await participant.browser.close();
            }

            return;
        }

        if (participant.closeMode !== 'page-only') {
            await participant.context.close();
            return;
        }

        for (const openPage of participant.context.pages()) {
            if (!openPage.isClosed()) {
                await openPage.close({
                    runBeforeUnload: false,
                });
            }
        }
    })();

    try {
        await participant.closePromise;
    } finally {
        participant.isClosed = true;
    }
};

export type { ManagedParticipant };
