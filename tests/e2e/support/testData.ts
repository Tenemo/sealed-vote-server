import { randomBytes } from 'node:crypto';

import type { TestInfo } from '@playwright/test';

const sanitize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

export const createTestNamespace = (testInfo: TestInfo): string => {
    const randomHex = randomBytes(3).toString('hex');
    return sanitize(
        `${testInfo.project.name}-${testInfo.retry}-${testInfo.repeatEachIndex}-${randomHex}`,
    ).slice(0, 24);
};

export const createPollName = (
    prefix: string,
    namespace: string,
): string => `${prefix} ${namespace}`.slice(0, 64);

export const createVoterName = (
    prefix: string,
    namespace: string,
): string => `${prefix}-${namespace}`.slice(0, 32);
