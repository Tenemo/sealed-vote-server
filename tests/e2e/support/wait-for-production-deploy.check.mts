import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createSyntheticPollPath,
    formatReadinessStatus,
    isReadinessStatusSuccessful,
    waitForProductionDeploy,
} from '../scripts/wait-for-production-deploy.mts';

const expectedCommitSha = 'ac15a2795b5344ab921a1790288a3572219e2f28';

const createJsonStatus = (
    overrides: Partial<{
        commitSha: string | null;
        ok: boolean;
        statusCode: number | null;
        url: string;
    }> = {},
) => ({
    commitSha: expectedCommitSha,
    ok: true,
    statusCode: 200,
    url: 'https://sealed.vote/version.json?t=1',
    ...overrides,
});

const createHtmlStatus = (
    overrides: Partial<{
        contentType: string | null;
        missingSnippetLabel: string | null;
        ok: boolean;
        statusCode: number | null;
        url: string;
    }> = {},
) => ({
    contentType: 'text/html; charset=utf-8',
    missingSnippetLabel: null,
    ok: true,
    statusCode: 200,
    url: 'https://sealed.vote/?t=1',
    ...overrides,
});

const createReadinessStatus = (
    overrides: Partial<{
        apiHealth: ReturnType<typeof createJsonStatus>;
        homepage: ReturnType<typeof createHtmlStatus>;
        pollPage: ReturnType<typeof createHtmlStatus>;
        webVersion: ReturnType<typeof createJsonStatus>;
    }> = {},
) => ({
    apiHealth: createJsonStatus({
        url: 'https://api.sealed.vote/api/health-check?t=1',
    }),
    homepage: createHtmlStatus({
        url: 'https://sealed.vote/?t=1',
    }),
    pollPage: createHtmlStatus({
        url: 'https://sealed.vote/polls/production-readiness-ac15a2795b53?t=1',
    }),
    webVersion: createJsonStatus({
        url: 'https://sealed.vote/version.json?t=1',
    }),
    ...overrides,
});

test('createSyntheticPollPath uses the commit prefix in the synthetic poll slug', () => {
    assert.equal(
        createSyntheticPollPath(expectedCommitSha),
        '/polls/production-readiness-ac15a2795b53',
    );
});

test('isReadinessStatusSuccessful requires matching commits and successful HTML probes', () => {
    assert.equal(
        isReadinessStatusSuccessful(createReadinessStatus(), expectedCommitSha),
        true,
    );

    assert.equal(
        isReadinessStatusSuccessful(
            createReadinessStatus({
                webVersion: createJsonStatus({
                    commitSha: 'e715a02987075c168f6e88c54488a3708096664a',
                }),
            }),
            expectedCommitSha,
        ),
        false,
    );

    assert.equal(
        isReadinessStatusSuccessful(
            createReadinessStatus({
                apiHealth: createJsonStatus({
                    commitSha: 'e715a02987075c168f6e88c54488a3708096664a',
                    url: 'https://api.sealed.vote/api/health-check?t=1',
                }),
            }),
            expectedCommitSha,
        ),
        false,
    );

    assert.equal(
        isReadinessStatusSuccessful(
            createReadinessStatus({
                pollPage: createHtmlStatus({
                    missingSnippetLabel: 'poll page canonical',
                    ok: false,
                }),
            }),
            expectedCommitSha,
        ),
        false,
    );
});

test('formatReadinessStatus reports unreachable, missing, and unknown HTML marker states', () => {
    assert.match(
        formatReadinessStatus(
            createReadinessStatus({
                apiHealth: createJsonStatus({
                    commitSha: null,
                    ok: false,
                    statusCode: null,
                    url: 'https://api.sealed.vote/api/health-check?t=1',
                }),
            }),
        ),
        /api health: status=unreachable, commitSha=missing/u,
    );

    assert.match(
        formatReadinessStatus(
            createReadinessStatus({
                homepage: createHtmlStatus({
                    contentType: null,
                    ok: false,
                    statusCode: null,
                }),
            }),
        ),
        /homepage: status=unreachable, contentType=missing, markers=unreachable/u,
    );

    assert.match(
        formatReadinessStatus(
            createReadinessStatus({
                pollPage: createHtmlStatus({
                    missingSnippetLabel: 'poll page canonical',
                    ok: false,
                    statusCode: 200,
                }),
            }),
        ),
            /poll page: status=200, contentType=text\/html; charset=utf-8, markers=missing poll page canonical/u,
    );

    assert.match(
        formatReadinessStatus(
            createReadinessStatus({
                homepage: createHtmlStatus({
                    contentType: 'application\/json',
                    ok: false,
                    statusCode: 503,
                }),
            }),
        ),
        /homepage: status=503, contentType=application\/json, markers=unknown/u,
    );
});

test('waitForProductionDeploy requires consecutive stable checks before returning', async () => {
    const readinessSequence = [
        createReadinessStatus({
            homepage: createHtmlStatus({
                missingSnippetLabel: 'homepage title',
                ok: false,
            }),
        }),
        createReadinessStatus(),
        createReadinessStatus({
            apiHealth: createJsonStatus({
                commitSha: 'e715a02987075c168f6e88c54488a3708096664a',
            }),
        }),
        createReadinessStatus(),
        createReadinessStatus(),
    ];
    const logs: string[] = [];
    let currentTimeMs = 0;
    let callCount = 0;

    await waitForProductionDeploy(
        {
            apiBaseUrl: 'https://api.sealed.vote',
            expectedCommitSha,
            intervalMs: 5,
            requestTimeoutMs: 5_000,
            requiredStableChecks: 2,
            timeoutMs: 100,
            webBaseUrl: 'https://sealed.vote',
        },
        {
            loadReadinessStatus: async () => {
                const status =
                    readinessSequence[
                        Math.min(callCount, readinessSequence.length - 1)
                    ];
                callCount += 1;
                return status;
            },
            log: (message: string) => {
                logs.push(message);
            },
            now: () => currentTimeMs,
            sleep: async (delayMs: number) => {
                currentTimeMs += delayMs;
            },
        },
    );

    assert.equal(callCount, 5);
    assert.match(logs[0] || '', /Waiting for stable production deploy/u);
    assert.match(logs[1] || '', /readiness check 1\/2 succeeded/u);
    assert.match(logs[2] || '', /Waiting for stable production deploy/u);
    assert.match(logs[5] || '', /stably serving commit/u);
});

test('waitForProductionDeploy times out when readiness never stabilizes', async () => {
    let currentTimeMs = 0;

    await assert.rejects(
        async () =>
            await waitForProductionDeploy(
                {
                    apiBaseUrl: 'https://api.sealed.vote',
                    expectedCommitSha,
                    intervalMs: 10,
                    requestTimeoutMs: 5_000,
                    requiredStableChecks: 2,
                    timeoutMs: 30,
                    webBaseUrl: 'https://sealed.vote',
                },
                {
                    loadReadinessStatus: async () =>
                        createReadinessStatus({
                            pollPage: createHtmlStatus({
                                missingSnippetLabel: 'poll page canonical',
                                ok: false,
                            }),
                        }),
                    log: () => undefined,
                    now: () => currentTimeMs,
                    sleep: async (delayMs: number) => {
                        currentTimeMs += delayMs;
                    },
                },
            ),
        /Timed out waiting for production frontend/u,
    );
});
