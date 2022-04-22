import envSchema from 'env-schema';
import S from 'fluent-json-schema';

const NODE_ENV = process.env.ENV_VARIABLE;

const schema = S.object()
    .prop('PORT', S.string().default(NODE_ENV === 'development' ? 4000 : 80))
    .prop(
        'DATABASE_URL',
        S.string().default('postgres://postgres:postgres@localhost:5432/sv-db'),
    )
    .prop('LOG_LEVEL', S.string().default('info'))
    .prop('PRETTY_PRINT', S.string().default(true))
    .prop('NODE_ENV', S.string().default('production'));

const config: {
    PORT: number;
    DATABASE_URL: string;
    LOG_LEVEL: string;
    PRETTY_PRINT: boolean;
    NODE_ENV: string;
} = envSchema({
    schema,
});

export default config;
