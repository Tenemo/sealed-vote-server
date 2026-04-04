import { resetDatabase } from '../src/test/resetDatabase';

void resetDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
});
