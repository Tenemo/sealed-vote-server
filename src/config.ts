import envSchema from 'env-schema';
import S from 'fluent-json-schema';

const schema = S.object()
    .prop('PORT', S.string().default(4000))
    .prop('LOG_LEVEL', S.string().default('info'));

const config: {
    LOG_LEVEL: string;
    PORT: number;
} = envSchema({
    schema,
});

export default config;
