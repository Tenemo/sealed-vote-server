import envSchema from 'env-schema';
import S from 'fluent-json-schema';

const schema = S.object()
    .prop('PORT', S.string().default(4000))
    .prop(
        'DATABASE_URL',
        S.string().default('postgres://postgres:postgres@localhost:5432/sv-db'),
    )
    .prop('LOG_LEVEL', S.string().default('info'))
    .prop('PRETTY_PRINT', S.string().default(true));

const config: {
    PORT: number;
    DATABASE_URL: string;
    LOG_LEVEL: string;
    PRETTY_PRINT: boolean;
} = envSchema({
    schema,
});

export default config;
