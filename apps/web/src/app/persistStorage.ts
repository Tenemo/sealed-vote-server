import storageLocalModule from 'redux-persist/lib/storage';

type PersistStorage = {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, item: string): Promise<unknown> | unknown;
    removeItem(key: string): Promise<unknown> | unknown;
};

type PersistStorageModule = PersistStorage | { default: unknown };

const isPersistStorage = (value: unknown): value is PersistStorage =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PersistStorage).getItem === 'function' &&
    typeof (value as PersistStorage).setItem === 'function' &&
    typeof (value as PersistStorage).removeItem === 'function';

export const normalizePersistStorage = (
    value: PersistStorageModule,
): PersistStorage => {
    let candidate: unknown = value;

    while (
        !isPersistStorage(candidate) &&
        typeof candidate === 'object' &&
        candidate !== null &&
        'default' in candidate
    ) {
        candidate = (candidate as { default: unknown }).default;
    }

    if (!isPersistStorage(candidate)) {
        throw new TypeError(
            'redux-persist local storage module did not expose a valid storage adapter.',
        );
    }

    return candidate;
};

export const localPersistStorage = normalizePersistStorage(storageLocalModule);
