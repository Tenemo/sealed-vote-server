import { beforeAll } from 'vitest';

import { resetDatabase } from '../database/admin';

beforeAll(async () => {
    await resetDatabase();
});
