import { migrateDatabase } from '../src/db/admin';

void migrateDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
});
