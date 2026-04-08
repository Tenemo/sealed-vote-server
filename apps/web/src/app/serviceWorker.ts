export const registerOfflineServiceWorker = async (): Promise<void> => {
    if (
        import.meta.env.MODE !== 'production' ||
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator)
    ) {
        return;
    }

    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/service-worker.js');
    });
};
