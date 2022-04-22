import envSchema from 'env-schema';
import S from 'fluent-json-schema';

const schema = S.object()
    .prop('PORT', S.string().default(4000))
    .prop('PG_HOST', S.string().default('localhost'))
    .prop('PG_DB', S.string().default('sv-db'))
    .prop('PG_PORT', S.number().default(5432))
    .prop('PG_USER', S.string().default('postgres'))
    .prop('PG_PASSWORD', S.string().default('postgres'))
    .prop('LOG_LEVEL', S.string().default('info'))
    .prop('PRETTY_PRINT', S.string().default(true));

const config: {
    PORT: number;
    PG_HOST: string;
    PG_DB: string;
    PG_PORT: number;
    PG_USER: string;
    PG_PASSWORD: string;
    LOG_LEVEL: string;
    PRETTY_PRINT: boolean;
} = envSchema({
    schema,
});

export default config;
