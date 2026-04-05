import { resetDatabase } from '../src/db/admin';

void resetDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
});
