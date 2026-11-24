import { getTarget } from './target.ts';

/** A guard refusal; distinct from TargetError, which means the configuration itself is invalid. */
export class EnvGuardError extends Error {
  readonly code = 'PROD_ACTION_BLOCKED';

  constructor(message: string) {
    super(message);
    this.name = 'EnvGuardError';
  }
}

/**
 * Runs a data-changing action unless the pinned environment is prod.
 * On prod it throws before the action is called; there is no dry-run or log-and-continue mode.
 */
export function envGuard<T>(action: () => T): T {
  if (getTarget().env === 'prod') {
    throw new EnvGuardError(
      'Refused a data-changing action on "prod"; data-changing actions may run only on "dev".',
    );
  }
  return action();
}
