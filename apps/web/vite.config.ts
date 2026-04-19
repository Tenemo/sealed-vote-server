import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { createDeploymentVersionPlugin } from './config/deployment-version';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const repositoryRootDirectory = path.resolve(rootDir, '..', '..');
const requireFromRepoRoot = createRequire(
    path.join(repositoryRootDirectory, 'package.json'),
);

const resolveFromRoot = (...segments: string[]): string =>
    path.resolve(rootDir, ...segments);

const resolveFromSrc = (...segments: string[]): string =>
    resolveFromRoot('src', ...segments);

const resolveTslibEntry = (): string =>
    requireFromRepoRoot.resolve('tslib/tslib.es6.mjs');

const getManualChunk = (id: string): string | undefined => {
    const normalizedId = id.replaceAll('\\', '/');

    if (
        normalizedId.includes('/packages/protocol/') ||
        normalizedId.includes('/node_modules/threshold-elgamal/')
    ) {
        return 'crypto';
    }

    if (
        normalizedId.includes('/node_modules/@radix-ui/') ||
        normalizedId.includes('/node_modules/@floating-ui/')
    ) {
        return 'ui';
    }

    if (
        normalizedId.includes('/node_modules/react/') ||
        normalizedId.includes('/node_modules/react-dom/') ||
        normalizedId.includes('/node_modules/scheduler/') ||
        normalizedId.includes('/node_modules/react-router-dom/') ||
        normalizedId.includes('/node_modules/react-error-boundary/') ||
        normalizedId.includes('/node_modules/react-helmet-async/')
    ) {
        return 'react';
    }

    if (
        normalizedId.includes('/node_modules/@reduxjs/') ||
        normalizedId.includes('/node_modules/react-redux/') ||
        normalizedId.includes('/node_modules/redux/') ||
        normalizedId.includes('/node_modules/immer/') ||
        normalizedId.includes('/node_modules/reselect/')
    ) {
        return 'state';
    }

    if (normalizedId.includes('/node_modules/')) {
        return 'vendor';
    }

    return undefined;
};

export default defineConfig({
    plugins: [react(), tailwindcss(), createDeploymentVersionPlugin()],
    resolve: {
        alias: {
            // Rolldown sometimes resolves third-party bare imports from the
            // real .pnpm store path instead of the workspace package boundary.
            // Pin tslib to the repo-root install so Netlify does not depend on
            // hidden pnpm fallback links existing in its cached install tree.
            tslib: resolveTslibEntry(),
            '@': resolveFromSrc(),
            app: resolveFromSrc('app'),
            components: resolveFromSrc('components'),
            features: resolveFromSrc('features'),
            fonts: resolveFromSrc('fonts'),
            typings: resolveFromSrc('typings'),
            utils: resolveFromSrc('utils'),
        },
    },
    server: {
        host: '0.0.0.0',
        port: 3000,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
            },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
    },
    build: {
        outDir: 'dist',
        rollupOptions: {
            output: {
                manualChunks: getManualChunk,
            },
        },
    },
});
