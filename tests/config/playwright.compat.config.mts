import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDirectory, '..', '..');

export default defineConfig({
    testDir: path.resolve(repoRoot, 'tests', 'e2e'),
    testMatch: '**/browser-crypto-compat.spec.ts',
    timeout: 30_000,
    fullyParallel: true,
    outputDir: path.resolve(repoRoot, 'test-results/browser-compat'),
    reporter: process.env.CI ? 'dot' : 'list',
    use: {
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
    },
    projects: [
        {
            name: 'chromium-desktop',
            use: {
                ...devices['Desktop Chrome'],
                browserName: 'chromium',
            },
        },
        {
            name: 'firefox-desktop',
            use: {
                ...devices['Desktop Firefox'],
                browserName: 'firefox',
            },
        },
        {
            name: 'webkit-desktop',
            use: {
                ...devices['Desktop Safari'],
                browserName: 'webkit',
            },
        },
        {
            name: 'mobile-webkit-iphone',
            use: {
                ...devices['iPhone 15'],
                browserName: 'webkit',
            },
        },
        {
            name: 'mobile-webkit-ipad',
            use: {
                ...devices['iPad (gen 11)'],
                browserName: 'webkit',
            },
        },
    ],
});
