import { defineConfig } from '@playwright/test';

import {
    createLocalE2EConfig,
    createProductionE2EConfig,
    createReadmeDemoConfig,
} from '../e2e/playwright-config.mts';

const resolvePlaywrightConfigProfile = (): 'local' | 'production' | 'readme-demo' => {
    const rawProfile = process.env.PLAYWRIGHT_CONFIG_PROFILE?.trim();

    if (!rawProfile || rawProfile === 'local') {
        return 'local';
    }

    if (rawProfile === 'production' || rawProfile === 'readme-demo') {
        return rawProfile;
    }

    throw new Error(
        `Unsupported PLAYWRIGHT_CONFIG_PROFILE value "${rawProfile}". Expected one of: local, production, readme-demo.`,
    );
};

const createPlaywrightConfig = () => {
    switch (resolvePlaywrightConfigProfile()) {
        case 'local':
            return createLocalE2EConfig();
        case 'production':
            return createProductionE2EConfig();
        case 'readme-demo':
            return createReadmeDemoConfig();
    }
};

export default defineConfig(createPlaywrightConfig());
