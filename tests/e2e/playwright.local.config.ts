import { defineConfig } from '@playwright/test';

import { createLocalE2EConfig } from './playwrightConfig.ts';

export default defineConfig(createLocalE2EConfig());
