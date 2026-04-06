import type { PersistConfig } from 'redux-persist';
import autoMergeLevel1Module from 'redux-persist/lib/stateReconciler/autoMergeLevel1';

export type PersistStateReconciler = Exclude<
  NonNullable<PersistConfig<Record<string, unknown>>['stateReconciler']>,
  false
>;

type PersistStateReconcilerModule =
  | PersistStateReconciler
  | { default: unknown };

export const isPersistStateReconciler = (
  value: unknown,
): value is PersistStateReconciler => typeof value === 'function';

export const normalizePersistStateReconciler = (
  value: PersistStateReconcilerModule,
): PersistStateReconciler => {
  let candidate: unknown = value;

  while (
    !isPersistStateReconciler(candidate) &&
    typeof candidate === 'object' &&
    candidate !== null &&
    'default' in candidate
  ) {
    candidate = (candidate as { default: unknown }).default;
  }

  if (!isPersistStateReconciler(candidate)) {
    throw new TypeError(
      'redux-persist state reconciler module did not expose a valid reconciler.',
    );
  }

  return candidate;
};

export const rootPersistStateReconciler = normalizePersistStateReconciler(
  autoMergeLevel1Module,
);
