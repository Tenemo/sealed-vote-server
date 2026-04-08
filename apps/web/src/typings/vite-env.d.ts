/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_POLLING_INTERVAL_MS?: string;
    readonly VITE_SENTRY_ENABLED?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
