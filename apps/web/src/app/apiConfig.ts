const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const apiBaseUrl = configuredApiBaseUrl
    ? configuredApiBaseUrl.replace(/\/+$/, '')
    : '/';

export const sentryTracePropagationTargets: Array<string | RegExp> = [
    'localhost',
    /^https:\/\/sealed\.vote\/api/,
];

if (configuredApiBaseUrl) {
    sentryTracePropagationTargets.push(apiBaseUrl);
}
