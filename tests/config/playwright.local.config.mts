import { defineConfig } from '@playwright/test';

import { createLocalE2EConfig } from '../e2e/playwrightConfig.mts';

export default defineConfig(createLocalE2EConfig());
