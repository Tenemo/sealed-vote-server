import path from 'path';

import { DefinePlugin, Configuration } from 'webpack';

export const WEB_BUNDLE_NAME = 'web';
export const WEB_TITLE = 'sealed.vote';

export const commonConfig: Configuration = {
    entry: {
        [WEB_BUNDLE_NAME]: [
            `core-js/stable`,
            `react`,
            `react-dom`,
            path.join(process.cwd(), `src/main`),
        ],
    },
    target: `web`,
    plugins: [
        new DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify(process.env.NODE_ENV),
                PORT: JSON.stringify(process.env.PORT),
                ANALYZE: JSON.stringify(process.env.ANALYZE),
                BUILD_DATE: JSON.stringify(
                    new Date().toISOString().split('T')[0],
                ),
            },
        }),
    ],
    resolve: {
        extensions: [`.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.scss`],
    },
    performance: {
        hints: false,
    },
};
