import { defineConfig } from '@playwright/test';

import { createProductionE2EConfig } from '../e2e/playwrightConfig.mts';

export default defineConfig(createProductionE2EConfig());
