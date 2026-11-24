// Isolated checks for getTarget, currentEnv, runIfEnv and envGuard. Each case runs a probe in a
// fresh Node process with its own environment, so this runner's pinned target is never switched.
// No page, browser, database or network is used.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { SkipTest } from '../env/runIfEnv';

// Typecheck evidence: Playwright's real `test` fits the shape runIfEnv calls.
const playwrightTestFitsRunIfEnv: SkipTest = test;
void playwrightTestFitsRunIfEnv;

const DEV = 'https://dev.ai-orchestration-courses.com';
const PROD = 'https://ai-orchestration-courses.com';
const TARGET_VARS = ['APP_ENV', 'BASE_URL', 'LOCAL_SANDBOX_DIR'];

type ProbeSettings = Partial<Record<'APP_ENV' | 'BASE_URL' | 'LOCAL_SANDBOX_DIR', string>>;

const show = (value: string) => JSON.stringify(value);

function runProbe(probe: string, settings: ProbeSettings) {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (TARGET_VARS.includes(key.toUpperCase()) || key.startsWith('TEST_')) continue;
    env[key] = value;
  }
  Object.assign(env, settings);

  const result = spawnSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', path.join(__dirname, 'probes', probe)],
    { env, encoding: 'utf8', timeout: 30_000 },
  );
  const lines = result.stdout.trim().split(/\r?\n/);
  expect(lines, `${probe} must print exactly one JSON line; stderr: ${result.stderr}`).toHaveLength(
    1,
  );
  return {
    status: result.status,
    output: JSON.parse(lines[0]),
    raw: result.stdout + result.stderr,
  };
}

test.describe('getTarget and currentEnv in fresh processes', { tag: '@safety' }, () => {
  const valid: [title: string, settings: ProbeSettings, env: string, baseURL: string][] = [
    ['absent APP_ENV selects dev', {}, 'dev', DEV],
    ['APP_ENV=dev selects dev', { APP_ENV: 'dev' }, 'dev', DEV],
    ['APP_ENV=prod selects prod', { APP_ENV: 'prod' }, 'prod', PROD],
    [
      'APP_ENV=prod with the exact prod BASE_URL selects prod',
      { APP_ENV: 'prod', BASE_URL: PROD },
      'prod',
      PROD,
    ],
  ];

  for (const [title, settings, env, baseURL] of valid) {
    test(`${title} and refuses a later switch`, () => {
      const { status, output } = runProbe('target.probe.ts', settings);
      expect(status).toBe(0);
      expect(output).toMatchObject({ ok: true, target: { env, baseURL }, currentEnv: env });
      expect(output.pinRefusal.name).toBe('TargetError');
      expect(output.pinRefusal.message).toContain('start a new process');
    });
  }

  for (const value of ['', 'DEV', ' dev', 'staging']) {
    test(`APP_ENV=${show(value)} fails in a fresh process`, () => {
      const { status, output } = runProbe('target.probe.ts', { APP_ENV: value });
      expect(status).toBe(1);
      expect(output.ok).toBe(false);
      expect(output.error.name).toBe('TargetError');
      expect(output.error.message).toContain('APP_ENV');
    });
  }

  test('an invalid BASE_URL fails without being echoed', () => {
    const secret = 'https://user:s3cr3t-token@internal.example.com/private';
    const { status, output, raw } = runProbe('target.probe.ts', { BASE_URL: secret });
    expect(status).toBe(1);
    expect(output.error.name).toBe('TargetError');
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain('s3cr3t-token');
  });

  test('LOCAL_SANDBOX_DIR is rejected without being echoed', () => {
    const dir = path.join('C:', 'Users', 'someone', 'private-sandbox');
    const { status, output, raw } = runProbe('target.probe.ts', { LOCAL_SANDBOX_DIR: dir });
    expect(status).toBe(1);
    expect(output.error.name).toBe('TargetError');
    expect(raw).not.toContain(dir);
    expect(raw).not.toContain('private-sandbox');
  });
});

test.describe('runIfEnv in fresh processes', { tag: '@safety' }, () => {
  const runs = { condition: false, description: expect.any(String) };
  const skipReason = (allowed: string, selected: string) =>
    `Runs only when APP_ENV is one of: ${allowed}. Selected: ${selected}.`;

  for (const [title, settings] of [
    ['absent APP_ENV', {}],
    ['APP_ENV=dev', { APP_ENV: 'dev' }],
  ] as const) {
    test(`${title}: dev-only runs, prod-only is skipped with both names`, () => {
      const { status, output } = runProbe('run-if-env.probe.ts', settings);
      expect(status).toBe(0);
      expect(output.devOnly).toEqual([runs]);
      expect(output.prodOnly).toEqual([
        { condition: true, description: skipReason('"prod"', '"dev"') },
      ]);
      expect(output.devAndProd).toEqual([runs]);
    });
  }

  test('APP_ENV=prod: prod-only runs, dev-only is skipped with both names', () => {
    const { status, output } = runProbe('run-if-env.probe.ts', { APP_ENV: 'prod' });
    expect(status).toBe(0);
    expect(output.devOnly).toEqual([
      { condition: true, description: skipReason('"dev"', '"prod"') },
    ]);
    expect(output.prodOnly).toEqual([runs]);
    expect(output.devAndProd).toEqual([runs]);
  });
});

test.describe('envGuard in fresh processes', { tag: '@safety' }, () => {
  for (const [title, settings] of [
    ['absent APP_ENV', {}],
    ['APP_ENV=dev', { APP_ENV: 'dev' }],
  ] as const) {
    test(`${title}: the dummy action runs exactly once`, () => {
      const { status, output } = runProbe('env-guard.probe.ts', settings);
      expect(status).toBe(0);
      expect(output).toMatchObject({ ok: true, env: 'dev', calls: 1, asyncCalls: 1 });
      expect(output.sync).toEqual({ blocked: false, result: 'changed', error: null });
    });
  }

  test('APP_ENV=prod: the guard throws before the dummy action is called', () => {
    const { status, output } = runProbe('env-guard.probe.ts', { APP_ENV: 'prod' });
    expect(status).toBe(0);
    expect(output).toMatchObject({ ok: true, env: 'prod', calls: 0, asyncCalls: 0 });
    for (const attempt of [output.sync, output.async]) {
      expect(attempt.blocked).toBe(true);
      expect(attempt.error).toMatchObject({ name: 'EnvGuardError', code: 'PROD_ACTION_BLOCKED' });
    }
  });
});
