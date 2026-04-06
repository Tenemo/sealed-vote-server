import { mergeConfig, defineConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./config/testSetup.ts'],
            include: ['src/**/*.spec.{ts,tsx}', 'config/**/*.spec.ts'],
            css: true,
            coverage: {
                include: ['src/**/*.{ts,tsx}'],
                exclude: ['src/main.tsx'],
            },
        },
    }),
);
