import type { Plugin } from 'vite';

const deploymentCommitShaEnvKeys = [
    'COMMIT_REF',
    'RAILWAY_GIT_COMMIT_SHA',
    'GITHUB_SHA',
] as const;
const commitShaPattern = /^[0-9a-f]{7,40}$/i;

export const versionJsonFileName = 'version.json';

export const resolveDeploymentCommitSha = (
    env: NodeJS.ProcessEnv = process.env,
): string | null => {
    for (const envKey of deploymentCommitShaEnvKeys) {
        const rawCommitSha = env[envKey]?.trim();

        if (rawCommitSha && commitShaPattern.test(rawCommitSha)) {
            return rawCommitSha.toLowerCase();
        }
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
