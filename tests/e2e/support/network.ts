import type { Page, Route } from '@playwright/test';

type RouteUrlMatcher = Parameters<Page['route']>[0];

type DroppedRequestHandle = {
    dispose: () => Promise<void>;
    waitForDrop: () => Promise<void>;
};

const dropResponseHeaderName = 'x-sealed-vote-e2e-drop-response';
const dropResponseHeaderValue = 'after-commit';
const dropResponseQueryParamName = '__e2e-drop-response';

export const dropNextPostResponseAfterServerCommit = async ({
    page,
    url,
}: {
    page: Page;
    url: RouteUrlMatcher;
}): Promise<DroppedRequestHandle> => {
    let wasDropped = false;
    let resolveDrop: (() => void) | null = null;
    const dropPromise = new Promise<void>((resolve) => {
        resolveDrop = resolve;
    });

    const handler = async (route: Route): Promise<void> => {
        if (wasDropped || route.request().method() !== 'POST') {
            await route.continue();
            return;
        }

        wasDropped = true;
        const request = route.request();
        const requestUrl = new URL(request.url());
        requestUrl.searchParams.set(
            dropResponseQueryParamName,
            dropResponseHeaderValue,
        );

        await route.continue({
            headers: {
                ...request.headers(),
                [dropResponseHeaderName]: dropResponseHeaderValue,
            },
            url: requestUrl.toString(),
        });
        await page.unroute(url, handler);
        resolveDrop?.();
    };

    await page.route(url, handler);

    return {
        dispose: async (): Promise<void> => {
            await page.unroute(url, handler);
        },
        waitForDrop: async (): Promise<void> => {
            await dropPromise;
        },
    };
};

export const failPollFetches = async ({
    page,
    url,
}: {
    page: Page;
    url: RouteUrlMatcher;
}): Promise<() => Promise<void>> => {
    const handler = async (route: Route): Promise<void> => {
        if (route.request().method() !== 'GET') {
            await route.continue();
            return;
        }

        await route.abort('failed');
    };

    await page.route(url, handler);

    return async (): Promise<void> => {
        await page.unroute(url, handler);
    };
};
