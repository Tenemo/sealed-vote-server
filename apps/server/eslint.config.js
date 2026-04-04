import { createWorkspaceConfig } from '../../tooling/eslint/create-workspace-config.mjs';

export default createWorkspaceConfig({
    configFileUrl: import.meta.url,
    includeSql: true,
    allowRequireAwait: true,
});
