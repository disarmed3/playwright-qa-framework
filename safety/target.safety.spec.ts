// Isolated checks for the pure target resolver: no page, no browser, no network, no process.env.
import { expect, test } from '@playwright/test';
import { resolveTarget, TargetError, type AppEnv, type TargetSettings } from '../env/target';

const DEV = 'https://dev.ai-orchestration-courses.com';
const PROD = 'https://ai-orchestration-courses.com';

const show = (value: string) => JSON.stringify(value);

function resolveError(settings: TargetSettings): TargetError {
  let caught: unknown;
  try {
    resolveTarget(settings);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TargetError);
  return caught as TargetError;
}

const accepted: [
  title: string,
  settings: TargetSettings | undefined,
  env: AppEnv,
  baseURL: string,
][] = [
  ['no settings at all', undefined, 'dev', DEV],
  ['APP_ENV explicitly undefined', { APP_ENV: undefined }, 'dev', DEV],
  ['APP_ENV=dev', { APP_ENV: 'dev' }, 'dev', DEV],
  ['APP_ENV=prod', { APP_ENV: 'prod' }, 'prod', PROD],
  ['dev with its canonical BASE_URL', { APP_ENV: 'dev', BASE_URL: DEV }, 'dev', DEV],
  ['prod with its canonical BASE_URL', { APP_ENV: 'prod', BASE_URL: PROD }, 'prod', PROD],
  ['default dev with its canonical BASE_URL', { BASE_URL: DEV }, 'dev', DEV],
];

const invalidAppEnvs = [
  '',
  ' ',
  '   ',
  '\t',
  '\n',
  'DEV',
  'Dev',
  'PROD',
  'Prod',
  ' dev ',
  'dev ',
  ' dev',
  'dev\r',
  'staging',
  'qa',
  'local',
  'test',
  'dev prod',
  'dev,prod',
  'undefined',
  'null',
];

const invalidDevBaseURLs = [
  '',
  '   ',
  `${DEV}/`,
  `${DEV}/login`,
  `${DEV}?redirect=1`,
  `${DEV}#top`,
  `${DEV}:443`,
  ` ${DEV}`,
  `${DEV} `,
  'http://dev.ai-orchestration-courses.com',
  'https://DEV.ai-orchestration-courses.com',
  `${DEV}.evil.example.com`,
  'http://localhost:3000',
  'https://evil.example.com',
  PROD,
];

const sandboxDirs = ['./sandbox', '', 'C:\\tmp\\sandbox', '/tmp/sandbox'];

const secretBaseURLs = [
  'https://user:s3cr3t-token@internal.example.com/private',
  'https://preview-9f2a1b.internal.example.com?token=abc123',
  'http://localhost:3000/admin',
];

const secretSandboxDirs = ['C:\\Users\\someone\\private-sandbox', '/home/someone/private-sandbox'];

// Added 2026-11-14 (Week 5 Task 03): prod-side address variants and non-string runtime values. The
// cases above and below are unchanged; these only add to them.
const invalidProdBaseURLs = [
  '   ',
  `${PROD}/`,
  `${PROD}/login`,
  `${PROD}?redirect=1`,
  `${PROD}#top`,
  `${PROD}:443`,
  ` ${PROD}`,
  `${PROD} `,
  'http://ai-orchestration-courses.com',
  'https://AI-ORCHESTRATION-COURSES.com',
  'https://www.ai-orchestration-courses.com',
  `${PROD}.evil.example.com`,
];

const nonStringValues: [label: string, value: unknown][] = [
  ['null', null],
  ['the number 0', 0],
  ['false', false],
  ['an empty object', {}],
  ['an array holding "dev"', ['dev']],
];

test.describe('resolveTarget, prod side and non-string values', { tag: '@safety' }, () => {
  for (const value of invalidProdBaseURLs) {
    test(`rejects BASE_URL=${show(value)} under prod`, () => {
      const { message } = resolveError({ APP_ENV: 'prod', BASE_URL: value });
      expect(message).toContain('BASE_URL');
      if (value.trim() !== '') expect(message).not.toContain(value);
    });
  }

  for (const [label, value] of nonStringValues) {
    test(`rejects ${label} as APP_ENV`, () => {
      expect(resolveError({ APP_ENV: value as string }).message).toContain('APP_ENV');
    });

    test(`rejects ${label} as BASE_URL`, () => {
      expect(resolveError({ APP_ENV: 'prod', BASE_URL: value as string }).message).toContain(
        'BASE_URL',
      );
    });
  }

  test('rejects LOCAL_SANDBOX_DIR even when APP_ENV=prod is otherwise valid', () => {
    const { message } = resolveError({ APP_ENV: 'prod', LOCAL_SANDBOX_DIR: './sandbox' });
    expect(message).toContain('LOCAL_SANDBOX_DIR');
  });
});

test.describe('resolveTarget', { tag: '@safety' }, () => {
  for (const [title, settings, env, baseURL] of accepted) {
    test(`accepts ${title}`, () => {
      expect(resolveTarget(settings)).toEqual({ env, baseURL });
    });
  }

  for (const value of invalidAppEnvs) {
    test(`rejects APP_ENV=${show(value)}`, () => {
      expect(resolveError({ APP_ENV: value }).message).toContain('APP_ENV');
    });
  }

  for (const value of invalidDevBaseURLs) {
    test(`rejects BASE_URL=${show(value)} under dev`, () => {
      const { message } = resolveError({ APP_ENV: 'dev', BASE_URL: value });
      expect(message).toContain('BASE_URL');
      if (value.trim() !== '') expect(message).not.toContain(value);
    });
  }

  test('rejects the dev address while prod is selected', () => {
    expect(resolveError({ APP_ENV: 'prod', BASE_URL: DEV }).message).toContain('BASE_URL');
  });

  for (const value of sandboxDirs) {
    test(`rejects LOCAL_SANDBOX_DIR=${show(value)}`, () => {
      expect(resolveError({ LOCAL_SANDBOX_DIR: value }).message).toContain('LOCAL_SANDBOX_DIR');
    });
  }

  test('reports the sandbox refusal ahead of any value error', () => {
    const { message } = resolveError({
      APP_ENV: 'staging',
      BASE_URL: 'https://evil.example.com',
      LOCAL_SANDBOX_DIR: './sandbox',
    });
    expect(message).toContain('LOCAL_SANDBOX_DIR');
    expect(message).not.toContain('APP_ENV');
    expect(message).not.toContain('BASE_URL');
  });

  test('reports the APP_ENV error ahead of the BASE_URL error', () => {
    const { message } = resolveError({ APP_ENV: 'staging', BASE_URL: 'https://evil.example.com' });
    expect(message).toContain('APP_ENV');
    expect(message).not.toContain('BASE_URL');
  });

  for (const value of secretBaseURLs) {
    test(`never echoes the supplied BASE_URL ${show(value)}`, () => {
      const { message } = resolveError({ BASE_URL: value });
      expect(message).not.toContain(value);
      expect(message).not.toContain(new URL(value).host);
    });
  }

  for (const value of secretSandboxDirs) {
    test(`never echoes the supplied LOCAL_SANDBOX_DIR ${show(value)}`, () => {
      const { message } = resolveError({ LOCAL_SANDBOX_DIR: value });
      expect(message).not.toContain(value);
      expect(message).not.toContain('private-sandbox');
    });
  }

  test('echoes an invalid APP_ENV, quoted, so padding and control characters are visible', () => {
    const value = ' dev\t';
    expect(resolveError({ APP_ENV: value }).message).toContain(show(value));
  });

  test('is deterministic and returns a shared frozen target', () => {
    const first = resolveTarget({ APP_ENV: 'prod' });
    expect(resolveTarget({ APP_ENV: 'prod', BASE_URL: PROD })).toBe(first);
    expect(resolveTarget()).toBe(resolveTarget({ APP_ENV: 'dev' }));
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as { baseURL: string }).baseURL = 'https://evil.example.com';
    }).toThrow(TypeError);
  });

  test('does not mutate the settings it is given', () => {
    const settings: TargetSettings = { APP_ENV: 'prod', BASE_URL: PROD };
    const snapshot = { ...settings };
    resolveTarget(Object.freeze(settings));
    expect(settings).toEqual(snapshot);
  });
});
