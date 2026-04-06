import { TextDecoder, TextEncoder } from 'util';

import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(globalThis, 'TextEncoder', {
  configurable: true,
  value: TextEncoder,
  writable: true,
});

Object.defineProperty(globalThis, 'TextDecoder', {
  configurable: true,
  value: TextDecoder,
  writable: true,
});

if (typeof globalThis.fetch === 'undefined') {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: vi.fn(() =>
      Promise.reject(new Error('Unexpected fetch call in tests.')),
    ),
    writable: true,
  });
}
