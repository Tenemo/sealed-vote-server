import type { BrowserContextOptions } from '@playwright/test';

export const mobileFirefoxAndroidUserAgent =
    'Mozilla/5.0 (Android 14; Mobile; rv:137.0) Gecko/137.0 Firefox/137.0';

export const mobileFirefoxAndroidContextOptions: BrowserContextOptions = {
    hasTouch: true,
    userAgent: mobileFirefoxAndroidUserAgent,
    viewport: {
        width: 412,
        height: 915,
    },
};
