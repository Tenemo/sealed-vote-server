import Fastify from 'fastify';

const PORT = process.env.PORT || 4000;

const start = async (): Promise<void> => {
    const fastify = Fastify();

    fastify.get('/health', async () => {
        return { hello: 'world' };
        await new Promise((res) => res(123));
    });

    try {
        await fastify.listen(PORT);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start()
    .then(() => console.log(`Server running on port ${PORT}`))
    .catch((error) => console.error(error));
