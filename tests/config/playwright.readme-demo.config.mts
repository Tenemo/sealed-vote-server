import { defineConfig } from '@playwright/test';

import { createReadmeDemoConfig } from '../e2e/playwrightConfig.mts';

export default defineConfig(createReadmeDemoConfig());
