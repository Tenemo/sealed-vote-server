import { beforeAll } from 'vitest';

import { resetDatabase } from '../db/admin';

beforeAll(async () => {
    await resetDatabase();
});
