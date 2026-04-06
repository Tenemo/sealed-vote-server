import { describe, expect, it } from 'vitest';

import {
    normalizePersistStateReconciler,
    type PersistStateReconciler,
    rootPersistStateReconciler,
} from './persistStateReconciler';

const createStateReconcilerStub =
    (): PersistStateReconciler => (inboundState) =>
        (inboundState ?? {}) as Record<string, unknown>;

describe('normalizePersistStateReconciler', () => {
    it('returns the state reconciler when the export is already flat', () => {
        const stateReconciler = createStateReconcilerStub();

        expect(normalizePersistStateReconciler(stateReconciler)).toBe(
            stateReconciler,
        );
    });

    it('unwraps nested default exports produced by module interop', () => {
        const stateReconciler = createStateReconcilerStub();

        expect(
            normalizePersistStateReconciler({
                default: {
                    default: stateReconciler,
                },
            }),
        ).toBe(stateReconciler);
    });

    it('throws when the export does not contain a state reconciler', () => {
        expect(() =>
            normalizePersistStateReconciler({
                default: {
                    missing: true,
                },
            }),
        ).toThrow(
            'redux-persist state reconciler module did not expose a valid reconciler.',
        );
    });
});

describe('rootPersistStateReconciler', () => {
    it('preserves reducer state that is not present in the persisted payload', () => {
        const pollsState = {
            queries: {},
        };
        const votingState = {};
        const originalState = {
            polls: pollsState,
            voting: votingState,
        };
        const reducedState = {
            polls: pollsState,
            voting: votingState,
        };

        const reconciledState = rootPersistStateReconciler(
            {
                voting: {
                    'poll-1': {
                        voterName: 'Alice',
                    },
                },
            },
            originalState,
            reducedState,
            {} as never,
        );

        expect(reconciledState).toEqual({
            polls: {
                queries: {},
            },
            voting: {
                'poll-1': {
                    voterName: 'Alice',
                },
            },
        });
    });
});
