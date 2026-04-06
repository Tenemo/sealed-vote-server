import { defineConfig } from '@playwright/test';

import { createLocalE2EConfig } from './tests/e2e/playwrightConfig';

export default defineConfig(createLocalE2EConfig());
