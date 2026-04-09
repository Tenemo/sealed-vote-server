import { execFileSync } from 'node:child_process';

import type { Plugin } from 'vite';

const deploymentCommitShaEnvKeys = [
    'COMMIT_REF',
    'RAILWAY_GIT_COMMIT_SHA',
    'GITHUB_SHA',
] as const;
const commitShaPattern = /^[0-9a-f]{7,40}$/i;

const versionJsonFileName = 'version.json';

const resolveGitHeadSha = (): string | null => {
    try {
        const rawCommitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();

        return commitShaPattern.test(rawCommitSha)
            ? rawCommitSha.toLowerCase()
            : null;
    } catch {
        return null;
    }
};

export const resolveDeploymentCommitSha = (
    env: NodeJS.ProcessEnv = process.env,
    resolveFallbackCommitSha: () => string | null = resolveGitHeadSha,
): string | null => {
    for (const envKey of deploymentCommitShaEnvKeys) {
        const rawCommitSha = env[envKey]?.trim();

        if (rawCommitSha && commitShaPattern.test(rawCommitSha)) {
            return rawCommitSha.toLowerCase();
        }
    }

    const fallbackCommitSha = resolveFallbackCommitSha()?.trim();

    if (fallbackCommitSha && commitShaPattern.test(fallbackCommitSha)) {
        return fallbackCommitSha.toLowerCase();
    }

    return null;
};

export const createDeploymentVersionPlugin = (): Plugin => ({
    name: 'deployment-version',
    generateBundle() {
        this.emitFile({
            type: 'asset',
            fileName: versionJsonFileName,
            source: `${JSON.stringify(
                {
                    commitSha: resolveDeploymentCommitSha(),
                },
                null,
                2,
            )}\n`,
        });
    },
});
