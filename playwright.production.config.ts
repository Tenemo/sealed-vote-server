import { defineConfig } from '@playwright/test';

import { createProductionE2EConfig } from './tests/e2e/playwrightConfig';

export default defineConfig(createProductionE2EConfig());
