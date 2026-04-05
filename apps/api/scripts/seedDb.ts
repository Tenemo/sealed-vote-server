import { buildServer } from '../src/buildServer';
import { formatSeedManifest, seedDatabase } from '../src/db/seed';

const run = async (): Promise<void> => {
    const fastify = await buildServer(false);

    try {
        const manifest = await seedDatabase(fastify);
        console.log(formatSeedManifest(manifest));
    } finally {
        await fastify.close();
    }
};

void run().catch((error) => {
    console.error(error);
    process.exit(1);
});
