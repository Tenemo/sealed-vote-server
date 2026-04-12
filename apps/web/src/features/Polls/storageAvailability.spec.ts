import { describe, expect, it, vi } from 'vitest';

import { canUseLocalStorage } from './storageAvailability';

describe('canUseLocalStorage', () => {
    it('returns true when local storage is available', () => {
        expect(canUseLocalStorage()).toBe(true);
    });

    it('returns false when reading local storage throws', () => {
        const localStorageGetterSpy = vi
            .spyOn(window, 'localStorage', 'get')
            .mockImplementation(() => {
                throw new DOMException(
                    'Blocked by browser policy',
                    'SecurityError',
                );
            });

        expect(canUseLocalStorage()).toBe(false);

        localStorageGetterSpy.mockRestore();
    });
});
