// Single source of truth for which course environment a process talks to.
// Errors never echo BASE_URL or LOCAL_SANDBOX_DIR values (they may hold hosts, paths or tokens).
// An invalid APP_ENV is echoed JSON-quoted so padding and control characters are visible.

export type AppEnv = 'dev' | 'prod';

export interface Target {
  readonly env: AppEnv;
  readonly baseURL: string;
}

export interface TargetSettings {
  APP_ENV?: string;
  BASE_URL?: string;
  LOCAL_SANDBOX_DIR?: string;
}

export class TargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetError';
  }
}

const TARGETS: Readonly<Record<AppEnv, Target>> = Object.freeze({
  dev: Object.freeze({ env: 'dev', baseURL: 'https://dev.ai-orchestration-courses.com' }),
  prod: Object.freeze({ env: 'prod', baseURL: 'https://ai-orchestration-courses.com' }),
});

/** Pure: validates the given settings (never reads process.env). Missing APP_ENV means dev. */
export function resolveTarget(settings: TargetSettings = {}): Target {
  if (settings.LOCAL_SANDBOX_DIR !== undefined) {
    throw new TargetError('LOCAL_SANDBOX_DIR is not supported; unset it.');
  }

  const appEnv = settings.APP_ENV;
  if (appEnv !== undefined && appEnv !== 'dev' && appEnv !== 'prod') {
    throw new TargetError(
      `APP_ENV=${JSON.stringify(appEnv)} is not valid; use exactly "dev" or "prod", or leave it unset for dev.`,
    );
  }
  const target = TARGETS[appEnv ?? 'dev'];

  if (settings.BASE_URL !== undefined && settings.BASE_URL !== target.baseURL) {
    throw new TargetError(
      `BASE_URL must be unset or exactly the canonical ${target.env} address (${target.baseURL}).`,
    );
  }

  return target;
}

let pinned: { settings: TargetSettings; target: Target } | undefined;

function readSettings(): TargetSettings {
  return {
    APP_ENV: process.env.APP_ENV,
    BASE_URL: process.env.BASE_URL,
    LOCAL_SANDBOX_DIR: process.env.LOCAL_SANDBOX_DIR,
  };
}

/** Resolves the target from process.env once and pins it; later changes are rejected. */
export function getTarget(): Target {
  const current = readSettings();
  if (pinned === undefined) {
    pinned = { settings: current, target: resolveTarget(current) };
    return pinned.target;
  }
  const changed = (Object.keys(current) as (keyof TargetSettings)[]).some(
    (key) => current[key] !== pinned!.settings[key],
  );
  if (changed) {
    throw new TargetError(
      'Target is pinned for this process; start a new process to switch environments.',
    );
  }
  return pinned.target;
}

/** The pinned environment name for this process (same validation and pinning as getTarget). */
export function currentEnv(): AppEnv {
  return getTarget().env;
}
