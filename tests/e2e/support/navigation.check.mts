import assert from 'node:assert/strict';
import test from 'node:test';

import {
    gotoInteractablePage,
    reloadInteractablePage,
    type NavigationTarget,
} from './navigation.mts';

type NavigationOptions = {
    referer?: string;
    timeout?: number;
    waitUntil?: 'commit' | 'domcontentloaded' | 'load' | 'networkidle';
};

const createPageDouble = (): NavigationTarget => ({
    goto: async (_url: string, _options?: NavigationOptions) => undefined,
    reload: async (_options?: NavigationOptions) => undefined,
    waitForTimeout: async (_timeout: number) => undefined,
});

test('gotoInteractablePage uses domcontentloaded with a short timeout', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble();
    page.goto = async (_url: string, options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    await gotoInteractablePage(page, 'https://sealed.vote/votes/example--1234');

    assert.deepEqual(calls, [
        {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('gotoInteractablePage retries transient Firefox navigation errors once', async () => {
    const gotoCalls: NavigationOptions[] = [];
    const retryDelays: number[] = [];
    let callCount = 0;
    const page = createPageDouble();

    page.goto = async (_url: string, options?: NavigationOptions) => {
        gotoCalls.push(options as NavigationOptions);
        callCount += 1;

        if (callCount === 1) {
            throw new Error('page.goto: NS_ERROR_NET_TIMEOUT');
        }
    };
    page.waitForTimeout = async (timeout: number) => {
        retryDelays.push(timeout);
    };

    await gotoInteractablePage(page, '/');

    assert.equal(callCount, 2);
    assert.deepEqual(retryDelays, [1_000]);
    assert.deepEqual(gotoCalls, [
        {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
        },
        {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
        },
    ]);
});

test('gotoInteractablePage does not retry non-transient navigation errors', async () => {
    const page = createPageDouble();
    let callCount = 0;

    page.goto = async () => {
        callCount += 1;
        throw new Error('page.goto: net::ERR_CONNECTION_REFUSED');
    };

    await assert.rejects(
        async () => await gotoInteractablePage(page, '/'),
        /ERR_CONNECTION_REFUSED/u,
    );
    assert.equal(callCount, 1);
});

test('reloadInteractablePage uses the same navigation policy', async () => {
    const calls: NavigationOptions[] = [];
    const page = createPageDouble();
    page.reload = async (options?: NavigationOptions) => {
        calls.push(options as NavigationOptions);
    };

    await reloadInteractablePage(page);

    assert.deepEqual(calls, [
        {
            timeout: 15_000,
            waitUntil: 'domcontentloaded',
        },
    ]);
});
