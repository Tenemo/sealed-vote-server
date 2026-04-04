import { createWorkspaceConfig } from '../../tooling/eslint/create-workspace-config.mjs';

export default createWorkspaceConfig({
    configFileUrl: import.meta.url,
    extraIgnores: ['src/**/*.d.ts', 'src/**/*.js'],
});
