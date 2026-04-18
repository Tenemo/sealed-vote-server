import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDebugContainerCommand,
    defaultProductionDebugArgs,
    parseDebugContainerCliArgs,
} from '../debugging/run-container-debug-helpers.mts';

test('parseDebugContainerCliArgs defaults to production mode when no mode is passed', () => {
    assert.deepEqual(parseDebugContainerCliArgs([]), {
        forwardedArgs: [],
        mode: 'production',
    });
});

test('parseDebugContainerCliArgs strips the forwarded separator after the mode', () => {
    assert.deepEqual(
        parseDebugContainerCliArgs([
            'production',
            '--',
            'tests/e2e/ceremony-persistence.spec.ts',
            '--project',
            'firefox-desktop',
        ]),
        {
            forwardedArgs: [
                'tests/e2e/ceremony-persistence.spec.ts',
                '--project',
                'firefox-desktop',
            ],
            mode: 'production',
        },
    );
});

test('parseDebugContainerCliArgs rejects unknown modes', () => {
    assert.throws(
        () => parseDebugContainerCliArgs(['not-a-mode']),
        /Unsupported e2e debug mode "not-a-mode"\./u,
    );
});

test('buildDebugContainerCommand defaults production mode to firefox-desktop', () => {
    assert.deepEqual(
        buildDebugContainerCommand({
            forwardedArgs: [],
            mode: 'production',
        }),
        ['pnpm', 'e2e:production:test', '--', ...defaultProductionDebugArgs],
    );
});

test('buildDebugContainerCommand forwards explicit production args', () => {
    assert.deepEqual(
        buildDebugContainerCommand({
            forwardedArgs: [
                'tests/e2e/ceremony-persistence.spec.ts',
                '--project',
                'mobile-firefox-android',
            ],
            mode: 'production',
        }),
        [
            'pnpm',
            'e2e:production:test',
            '--',
            'tests/e2e/ceremony-persistence.spec.ts',
            '--project',
            'mobile-firefox-android',
        ],
    );
});

test('buildDebugContainerCommand opens a shell in shell mode', () => {
    assert.deepEqual(
        buildDebugContainerCommand({
            forwardedArgs: [],
            mode: 'shell',
        }),
        ['bash'],
    );
});

test('buildDebugContainerCommand requires an explicit command in command mode', () => {
    assert.throws(
        () =>
            buildDebugContainerCommand({
                forwardedArgs: [],
                mode: 'command',
            }),
        /The command mode requires a command after "--"./u,
    );
});

test('buildDebugContainerCommand forwards arbitrary commands verbatim', () => {
    assert.deepEqual(
        buildDebugContainerCommand({
            forwardedArgs: ['pnpm', 'test'],
            mode: 'command',
        }),
        ['pnpm', 'test'],
    );
});
