import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

const resolveFromRoot = (...segments: string[]): string =>
    path.resolve(rootDir, ...segments);

const resolveFromSrc = (...segments: string[]): string =>
    resolveFromRoot('src', ...segments);

export default defineConfig({
    plugins: [react()],
    define: {
        __BUILD_DATE__: JSON.stringify(new Date().toISOString().split('T')[0]),
    },
    resolve: {
        alias: {
            app: resolveFromSrc('app'),
            components: resolveFromSrc('components'),
            features: resolveFromSrc('features'),
            fonts: resolveFromSrc('fonts'),
            styles: resolveFromSrc('styles'),
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
    css: {
        preprocessorOptions: {
            scss: {
                loadPaths: [resolveFromSrc('styles')],
            },
        },
    },
    build: {
        outDir: 'dist',
    },
});
