import { describe, expect, it } from 'vitest';

import { normalizePersistStorage } from './persistStorage';

const createStorageStub = (): {
  getItem: () => null;
  setItem: () => undefined;
  removeItem: () => undefined;
} => ({
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
});

describe('normalizePersistStorage', () => {
  it('returns the storage adapter when the export is already flat', () => {
    const storage = createStorageStub();

    expect(normalizePersistStorage(storage)).toBe(storage);
  });

  it('unwraps nested default exports produced by module interop', () => {
    const storage = createStorageStub();

    expect(
      normalizePersistStorage({
        default: {
          default: storage,
        },
      }),
    ).toBe(storage);
  });

  it('throws when the export does not contain a storage adapter', () => {
    expect(() =>
      normalizePersistStorage({
        default: {
          missing: true,
        },
      }),
    ).toThrow(
      'redux-persist session storage module did not expose a valid storage adapter.',
    );
  });
});
