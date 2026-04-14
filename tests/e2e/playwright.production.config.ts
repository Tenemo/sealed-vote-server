import { defineConfig } from '@playwright/test';

import { createProductionE2EConfig } from './playwrightConfig.ts';

export default defineConfig(createProductionE2EConfig());
