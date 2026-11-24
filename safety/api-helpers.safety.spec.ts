// Isolated checks for the Blog API helpers in tests/support/api.ts (Week 3 Task 05). Target and
// prod-refusal cases run a probe in a fresh Node process with its own environment; the cleanup
// cases call the fixture's cleanup function in this process with dummy deleters and ids.
// No page, browser, database or network is used.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  listItems,
  ownedName,
  readEntity,
  runIdFrom,
  setCookies,
  withOwnedRecords,
  type OwnedRecords,
} from '../tests/support/api';

const TARGET_VARS = ['APP_ENV', 'BASE_URL', 'LOCAL_SANDBOX_DIR'];
const WRITES = [
  'createArticle',
  'updateArticle',
  'deleteArticle',
  'postComment',
  'deleteComment',
  'OwnedArticles.createAs',
];

function runApiProbe(settings: Partial<Record<'APP_ENV' | 'BASE_URL', string>>) {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (TARGET_VARS.includes(key.toUpperCase()) || key.startsWith('TEST_')) continue;
    env[key] = value;
  }
  Object.assign(env, settings);
  const result = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      path.join(__dirname, 'probes', 'api-helpers.probe.ts'),
    ],
    { env, encoding: 'utf8', timeout: 30_000 },
  );
  const lines = result.stdout.trim().split(/\r?\n/);
  expect(
    lines,
    `the probe must print exactly one JSON line; stderr: ${result.stderr}`,
  ).toHaveLength(1);
  return {
    status: result.status,
    output: JSON.parse(lines[0]),
    raw: result.stdout + result.stderr,
  };
}

test.describe('API write helpers in fresh processes', { tag: '@safety' }, () => {
  test('APP_ENV=dev: each write helper reaches the dummy client exactly once', () => {
    const { status, output } = runApiProbe({ APP_ENV: 'dev' });
    expect(status).toBe(0);
    expect(output.ok).toBe(true);
    for (const name of WRITES)
      expect(output.attempts[name], name).toEqual({ blocked: false, error: null });
    expect(output.calls).toEqual({ get: 0, post: 3, patch: 1, delete: 2 });
  });

  test('APP_ENV=prod: every write helper throws before the dummy client is called', () => {
    const { status, output } = runApiProbe({ APP_ENV: 'prod' });
    expect(status).toBe(0);
    expect(output.ok).toBe(true);
    for (const name of WRITES) {
      expect(output.attempts[name].blocked, name).toBe(true);
      expect(output.attempts[name].error, name).toMatchObject({
        name: 'EnvGuardError',
        code: 'PROD_ACTION_BLOCKED',
      });
    }
    expect(output.calls).toEqual({ get: 0, post: 0, patch: 0, delete: 0 });
  });

  test('an invalid APP_ENV stops the helper module from loading', () => {
    const { status, output } = runApiProbe({ APP_ENV: 'staging' });
    expect(status).toBe(1);
    expect(output).toMatchObject({ ok: false, error: { name: 'TargetError' } });
  });

  test('a non-canonical BASE_URL stops the helper module from loading without being echoed', () => {
    const supplied = 'https://example.invalid/qa-probe-value';
    const { status, output, raw } = runApiProbe({ APP_ENV: 'dev', BASE_URL: supplied });
    expect(status).toBe(1);
    expect(output).toMatchObject({ ok: false, error: { name: 'TargetError' } });
    expect(raw).not.toContain(supplied);
  });
});

test.describe(
  'owned-record cleanup with a deliberately failing assertion',
  { tag: '@safety' },
  () => {
    test('a failed assertion still deletes every registered record, newest first', async () => {
      const deleted: number[] = [];
      let registry: OwnedRecords | undefined;
      const outcome = await withOwnedRecords(
        async (id) => {
          deleted.push(id);
        },
        async (records) => {
          registry = records;
          records.register(101);
          records.register(102);
          expect(1, 'deliberate failure inside the owned-records scope').toBe(2);
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toContain(
        'deliberate failure inside the owned-records scope',
      );
      expect(deleted).toEqual([102, 101]);
      expect(registry?.registered).toEqual([]);
    });

    test('a cleanup that also fails keeps the test failure first and reports both', async () => {
      const outcome = await withOwnedRecords(
        async (id) => {
          throw new Error(`dummy delete of ${id} failed`);
        },
        async (records) => {
          records.register(201);
          expect(1, 'deliberate failure before a failing cleanup').toBe(2);
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(AggregateError);
      const [first, second] = (outcome as AggregateError).errors;
      expect(String(first)).toContain('deliberate failure before a failing cleanup');
      expect(second).toBeInstanceOf(AggregateError);
      expect(String((second as AggregateError).errors[0])).toContain('dummy delete of 201 failed');
    });

    test('a passing scope deletes everything; a failed delete alone is reported after trying all', async () => {
      const deleted: number[] = [];
      await withOwnedRecords(
        async (id) => {
          deleted.push(id);
        },
        async (records) => {
          records.register(301);
          records.register(302);
        },
      );
      expect(deleted).toEqual([302, 301]);

      const tried: number[] = [];
      const outcome = await withOwnedRecords(
        async (id) => {
          tried.push(id);
          if (id === 402) throw new Error('dummy delete of 402 failed');
        },
        async (records) => {
          records.register(401);
          records.register(402);
        },
      ).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(tried).toEqual([402, 401]);
      expect(outcome).toBeInstanceOf(AggregateError);
      expect((outcome as AggregateError).errors).toHaveLength(1);
    });
  },
);

test.describe('API helper inputs and outputs', { tag: '@safety' }, () => {
  test('the run id must be present and well formed; owned names carry it and the test id', () => {
    expect(() => runIdFrom({})).toThrow(/QA_RUN_ID is missing or malformed/);
    expect(() => runIdFrom({ QA_RUN_ID: 'qa-auto-*' })).toThrow(
      /QA_RUN_ID is missing or malformed/,
    );
    expect(runIdFrom({ QA_RUN_ID: '20261028T231500Z-a1b2c3' })).toBe('20261028T231500Z-a1b2c3');
    expect(ownedName('20261028T231500Z-a1b2c3', 'abc-123')).toBe(
      'qa-auto-20261028T231500Z-a1b2c3-abc-123',
    );
    expect(ownedName('20261028T231500Z-a1b2c3', 'abc-123', 'd')).toBe(
      'qa-auto-20261028T231500Z-a1b2c3-abc-123-d',
    );
  });

  test('Set-Cookie parsing keeps names and attributes and drops every cookie value', () => {
    const response = {
      headersArray: () => [
        {
          name: 'Set-Cookie',
          value: 'qa_probe=probe-cookie-value; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60',
        },
        { name: 'Content-Type', value: 'application/json' },
      ],
    };
    const cookies = setCookies(response);
    expect(cookies).toEqual([
      { name: 'qa_probe', attributes: ['path=/', 'httponly', 'secure', 'samesite=lax'] },
    ]);
    expect(JSON.stringify(cookies)).not.toContain('probe-cookie-value');
  });

  test('response readers locate a record or a list and name only keys when they cannot', () => {
    expect(readEntity({ id: 7, title: 't' })).toEqual({ id: 7, title: 't' });
    expect(readEntity({ article: { id: 8 } })).toEqual({ id: 8 });
    expect(() => readEntity({ token: 'probe-secret-value' })).toThrow(/keys: token\)/);
    expect(() => readEntity({ token: 'probe-secret-value' })).not.toThrow(/probe-secret-value/);
    expect(listItems([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(listItems({ items: [{ id: 2 }], total: 1 })).toEqual([{ id: 2 }]);
    expect(() => listItems({ a: [], b: [] })).toThrow(
      /no single list in the response \(keys: a, b\)/,
    );
  });
});
