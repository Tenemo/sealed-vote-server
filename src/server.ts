import Fastify, { FastifyInstance } from 'fastify';
import FastifyPostgres from 'fastify-postgres';
import dotenv from 'dotenv';

import vote from 'routes/vote';
import createVote from 'routes/create-poll';
import results from 'routes/poll';

dotenv.config();

const buildServer = async (): Promise<FastifyInstance> => {
    const fastify = Fastify({
        logger: {
            level: process.env.LOG_LEVEL ?? 'info',
            prettyPrint: !!(process.env.PRETTY_PRINT === 'true'),
        },
    });
    await fastify.register(FastifyPostgres, {
        connectionString:
            process.env.DATABASE_URL ??
            'postgres://postgres:postgres@localhost:5432/sv-db',
        ssl: {
            rejectUnauthorized: false,
        },
    });
    await fastify.register(vote, { prefix: '/api' });
    await fastify.register(createVote, { prefix: '/api' });
    await fastify.register(results, { prefix: '/api' });
    return fastify;
};

const start = async (): Promise<void> => {
    const fastify = await buildServer();

    try {
        await fastify.listen(process.env.PORT ?? 4000);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

if (process.env.NOPE === 'NOPE') {
    void start();
}

// import express from 'express';
// const app = express();
const PORT = process.env.PORT || 4000;

// app.get('/', (req, res) => {
//     console.log(req);
//     res.send('Hello World!');
// });

// app.listen(PORT, () => {
//     console.log(`Example app listening on port ${PORT}`);
// });
const start2 = async function (): Promise<void> {
    const fastify = Fastify();

    fastify.get('/', async () => {
        return { hello: 'world' };
    });

    try {
        await fastify.listen(PORT);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

void start2();
