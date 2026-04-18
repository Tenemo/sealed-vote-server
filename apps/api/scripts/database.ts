import { buildServer } from '../src/build-server';
import { migrateDatabase, resetDatabase } from '../src/database/admin';
import { formatSeedManifest, seedDatabase } from '../src/database/seed';

const supportedCommands = ['migrate', 'reset', 'seed'] as const;

type DbCommand = (typeof supportedCommands)[number];

const fail = (message: string): never => {
    throw new Error(message);
};

const parseCommand = (value: string | undefined): DbCommand => {
    if (value === 'migrate' || value === 'reset' || value === 'seed') {
        return value;
    }

    return fail(
        `Unknown database command "${value ?? ''}". Expected one of: ${supportedCommands.join(', ')}.`,
    );
};

const runSeed = async (): Promise<void> => {
    const fastify = await buildServer(false);

    try {
        const manifest = await seedDatabase(fastify);
        console.log(formatSeedManifest(manifest));
    } finally {
        await fastify.close();
    }
};

const run = async (): Promise<void> => {
    switch (parseCommand(process.argv[2])) {
        case 'migrate':
            await migrateDatabase();
            return;
        case 'reset':
            await resetDatabase();
            return;
        case 'seed':
            await runSeed();
            return;
    }
};

void run().catch((error) => {
    console.error(error);
    process.exit(1);
});
