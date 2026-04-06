import { describe, expect, it } from 'vitest';

import { shouldEnableReduxDevTools } from './reduxDevTools';

describe('shouldEnableReduxDevTools', () => {
    it('disables Redux DevTools in production', () => {
        expect(shouldEnableReduxDevTools('production')).toBe(false);
    });

    it('keeps Redux DevTools enabled outside production', () => {
        expect(shouldEnableReduxDevTools('development')).toBe(true);
        expect(shouldEnableReduxDevTools('test')).toBe(true);
        expect(shouldEnableReduxDevTools('preview')).toBe(true);
    });
});
