export const canUseLocalStorage = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    try {
        return typeof window.localStorage !== 'undefined';
    } catch {
        return false;
    }
};
