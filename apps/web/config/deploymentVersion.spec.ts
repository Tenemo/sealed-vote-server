import { describe, expect, test } from 'vitest';

import { resolveDeploymentCommitSha } from './deploymentVersion';

describe('resolveDeploymentCommitSha', () => {
  test('returns null when no deployment SHA is configured', () => {
    expect(
      resolveDeploymentCommitSha({
        COMMIT_REF: undefined,
        GITHUB_SHA: undefined,
        RAILWAY_GIT_COMMIT_SHA: undefined,
      }),
    ).toBeNull();
  });

  test('prefers the Netlify deployment SHA', () => {
    expect(
      resolveDeploymentCommitSha({
        COMMIT_REF: 'ABCDEF1234567890',
        GITHUB_SHA: '1111111111111111',
        RAILWAY_GIT_COMMIT_SHA: '2222222222222222',
      }),
    ).toBe('abcdef1234567890');
  });

  test('falls back to the Railway deployment SHA', () => {
    expect(
      resolveDeploymentCommitSha({
        COMMIT_REF: undefined,
        GITHUB_SHA: '1111111111111111',
        RAILWAY_GIT_COMMIT_SHA: 'ABCDEF1234567890',
      }),
    ).toBe('abcdef1234567890');
  });

  test('ignores invalid SHA values', () => {
    expect(
      resolveDeploymentCommitSha({
        COMMIT_REF: 'not-a-sha',
        GITHUB_SHA: '111',
        RAILWAY_GIT_COMMIT_SHA: 'ABCDEF1234567890',
      }),
    ).toBe('abcdef1234567890');
  });
});
