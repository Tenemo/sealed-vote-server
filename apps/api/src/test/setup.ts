import { beforeAll } from 'vitest';

import { resetDatabase } from './resetDatabase';

beforeAll(async () => {
    await resetDatabase();
});
