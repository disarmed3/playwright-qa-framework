// Isolated checks for scripts/check-env-gates.mjs (Week 5 Task 03). node:test, no browser, no network,
// no process.env, no application test. Every fixture is a string written to a new temp folder, so
// Playwright's discovery (tests/, safety/), tsc, ESLint and Prettier never see it. The script runs as
// a child process (`node scripts/check-env-gates.mjs --root <temp>/specs`) and only reads the folder.
//
// Each case names its purpose and one exact outcome: the exit status and the complete, sorted list of
// finding codes. NOTE lines are not findings. Hook wiring is checked in safety-tests/vault-git.test.mjs
// (`npm run test:git-hooks`), which runs the real .husky/pre-push in a disposable repository.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  API_HELPER_FUNCTIONS,
  OWNED_RECORD_MEMBERS,
  SELF_GUARDED_MEMBERS,
  UI_WRITE_MEMBERS,
  guardingMembers,
} from '../scripts/check-env-gates.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/check-env-gates.mjs', import.meta.url));
const PROJECT = fileURLToPath(new URL('..', import.meta.url));

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Writes {name: text | Buffer} under <new temp>/specs and returns that folder. */
function makeRoot(files) {
  const base = mkdtempSync(join(tmpdir(), 'check-env-gates-'));
  temps.push(base);
  const root = join(base, 'specs');
  mkdirSync(root);
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

function check(args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: PROJECT, encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

/** The finding codes of an output, sorted; NOTE lines and the summary line are not findings. */
function codesOf(out) {
  return out
    .split('\n')
    .filter((line) => !line.startsWith('check-env-gates:'))
    .map((line) => /(?:^|\s)(E_[A-Z_]+)(?=\s|$)/.exec(line)?.[1])
    .filter((code) => code !== undefined)
    .sort();
}

const IMPORTS = [
  "import { expect } from '@playwright/test';",
  "import { envGuard } from '../env/envGuard';",
  "import { runIfEnv } from '../env/runIfEnv';",
  "import { test } from './support/api';",
  '',
].join('\n');
const spec = (body) => `${IMPORTS}${body}\n`;

// ---------------------------------------------------------------------------------------------
// Fixtures: [purpose, spec text, exit status, exact sorted finding codes]

const VALID_READ_ONLY = [
  "test.describe('read only', { tag: '@regression' }, () => {",
  "  runIfEnv(test, ['dev']);",
  "  test('reads', async ({ page, cart, pageCart }) => {",
  "    await expect(page).toHaveURL('/');",
  '    await cart.read();',
  '    await pageCart.open();',
  '  });',
  '});',
].join('\n');

const cases = [
  [
    'valid dev-only block; read() and open() guard themselves and need no wrapper',
    spec(VALID_READ_ONLY),
    0,
    [],
  ],
  [
    'valid dev-only block; the write starts inside the envGuard closure',
    spec(
      [
        "test.describe('guarded write', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('writes', async ({ api }) => {",
        '    await test.step(\'create "qa-auto-x"\', () =>',
        "      envGuard(() => api.post('/api/articles', { data: {} })));",
        '  });',
        '});',
      ].join('\n'),
    ),
    0,
    [],
  ],
  [
    'valid nested blocks, each with its own declaration',
    spec(
      [
        "test.describe('outer', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test.describe('inner', () => {",
        "    runIfEnv(test, ['dev']);",
        "    test('t', async () => {});",
        '  });',
        '});',
      ].join('\n'),
    ),
    0,
    [],
  ],
  [
    'missing declaration: a describe with no runIfEnv',
    spec(["test.describe('d', () => {", "  test('t', async () => {});", '});'].join('\n')),
    1,
    ['E_MISSING_DECL'],
  ],
  [
    'nested: the outer declaration must not hide a missing inner declaration',
    spec(
      [
        "test.describe('outer', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test.describe('inner', () => {",
        "    test('t', async () => {});",
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_MISSING_DECL'],
  ],
  [
    'commented-out describes (line and block) are not blocks; the file has no describe',
    spec(
      [
        "// test.describe('x', () => {",
        "//   runIfEnv(test, ['dev']);",
        '// });',
        "/* test.describe('y', () => { runIfEnv(test, ['dev']); }); */",
      ].join('\n'),
    ),
    1,
    ['E_NO_DESCRIBE'],
  ],
  [
    'commented-out describe beside a real one without a declaration; a commented runIfEnv does not count',
    spec(
      [
        "// test.describe('old', () => { runIfEnv(test, ['dev']); });",
        "test.describe('real', () => {",
        "  // runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_MISSING_DECL'],
  ],
  [
    'string and template text that looks like a declaration or a guard is not one',
    spec(
      [
        "test.describe('lookalikes', () => {",
        '  const a = "runIfEnv(test, [\'dev\'])";',
        "  const b = `envGuard(() => api.post('/x'))`;",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_MISSING_DECL'],
  ],
  [
    'a string "api.post(" beside a valid declaration is not a write',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  const text = 'api.post( is only text here';",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    0,
    [],
  ],
  [
    'a string "envGuard(" does not guard a real bare write',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  const text = 'envGuard( api.post( )';",
        "  test('t', async ({ api }) => { await api.post('/x'); });",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_UNGUARDED_MUTATION'],
  ],
  [
    'an expression inside a template placeholder is real code: a bare write there is found',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async ({ api }) => {",
        "    const text = `${await api.post('/x')}`;",
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_UNGUARDED_MUTATION'],
  ],
  [
    'a runIfEnv call only inside a template placeholder is not a declaration statement',
    spec(
      [
        "test.describe('d', () => {",
        "  `${runIfEnv(test, ['dev'])}`;",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_MISPLACED', 'E_MISSING_DECL'],
  ],
  [
    'missing guard: a dev-only block with a bare write',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async ({ api }) => { await api.post('/x'); });",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_UNGUARDED_MUTATION'],
  ],
  [
    'a bare global fetch( counts as a write',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => { await fetch('/x'); });",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_UNGUARDED_MUTATION'],
  ],
  [
    'envGuard given a promise that already started: not a closure, and the write is unguarded',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async ({ api }) => {",
        "    const p = api.post('/x');",
        '    await envGuard(p);',
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_GUARD_NOT_CLOSURE', 'E_UNGUARDED_MUTATION'],
  ],
  [
    'contradictory: a block that may run on prod holds a guarded write',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev', 'prod']);",
        "  test('t', async ({ api }) => {",
        "    await envGuard(() => api.post('/x'));",
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_NOT_DEV_ONLY', 'E_PROD_MUTATION_GUARD'],
  ],
  [
    "a prod-only, read-only block still breaks rule 01 (exactly ['dev'])",
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['prod']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_NOT_DEV_ONLY'],
  ],
  [
    'a nested block may not allow more than its enclosing block',
    spec(
      [
        "test.describe('outer', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test.describe('inner', () => {",
        "    runIfEnv(test, ['dev', 'prod']);",
        "    test('t', async () => {});",
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_NESTED_NOT_SUBSET', 'E_NOT_DEV_ONLY'],
  ],
  [
    'unsupported: a describe modifier',
    spec(
      [
        "test.describe.serial('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_MODIFIER'],
  ],
  [
    'unsupported: a renamed runIfEnv import',
    spec(
      [
        "import { runIfEnv as gate } from '../env/runIfEnv';",
        "test.describe('d', () => {",
        "  gate(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_ALIAS', 'E_MISSING_DECL'],
  ],
  [
    'unsupported: describe copied into a variable',
    spec(
      [
        'const d = test.describe;',
        "test.describe('real', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_ALIAS'],
  ],
  [
    'unsupported: a describe inside a loop',
    spec(
      [
        'for (const n of [1, 2]) {',
        "  test.describe('d' + n, () => {",
        "    runIfEnv(test, ['dev']);",
        "    test('t', async () => {});",
        '  });',
        '}',
      ].join('\n'),
    ),
    1,
    ['E_DESCRIBE_INDIRECT'],
  ],
  [
    'unsupported: a top-level call that might declare tests',
    spec(
      [
        'function makeSuite() {}',
        'makeSuite();',
        "test.describe('real', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_TOPLEVEL'],
  ],
  [
    'unsupported: a test declared outside any describe',
    spec(
      [
        "test('loose', async () => {});",
        "test.describe('real', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_TEST_OUTSIDE_DESCRIBE'],
  ],
  [
    'unsupported: the allowed list is a variable',
    spec(
      [
        "const LIST = ['dev'];",
        "test.describe('d', () => {",
        '  runIfEnv(test, LIST);',
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_UNSUPPORTED'],
  ],
  [
    'unsupported: the allowed list uses a spread',
    spec(
      [
        "const LIST = ['dev'];",
        "test.describe('d', () => {",
        '  runIfEnv(test, [...LIST]);',
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_UNSUPPORTED'],
  ],
  [
    'unsupported: an empty allowed list',
    spec(
      [
        "test.describe('d', () => {",
        '  runIfEnv(test, []);',
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_UNSUPPORTED'],
  ],
  [
    'unsupported: a repeated entry in the allowed list',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev', 'dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_UNSUPPORTED'],
  ],
  [
    'unsupported: the list is wrapped in `as const`',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev'] as const);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_UNSUPPORTED'],
  ],
  [
    'the declaration is the second statement, not the first',
    spec(
      [
        "test.describe('d', () => {",
        '  const note = 1;',
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_NOT_FIRST'],
  ],
  [
    'runIfEnv only inside a test body: missing, and misplaced',
    spec(
      [
        "test.describe('d', () => {",
        "  test('t', async () => {",
        "    runIfEnv(test, ['dev']);",
        '  });',
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DECL_MISPLACED', 'E_MISSING_DECL'],
  ],
  [
    'two declarations in one describe',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async () => {});",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DUPLICATE_DECL'],
  ],
  [
    'runIfEnv is used but never imported',
    [
      "import { expect } from '@playwright/test';",
      "import { test } from './support/api';",
      "test.describe('d', () => {",
      "  runIfEnv(test, ['dev']);",
      "  test('t', async () => {});",
      '});',
      '',
    ].join('\n'),
    1,
    ['E_IMPORT'],
  ],
  [
    'runIfEnv imported from an unrecognized module',
    [
      "import { test } from './support/api';",
      "import { runIfEnv } from './somewhere-else';",
      "test.describe('d', () => {",
      "  runIfEnv(test, ['dev']);",
      "  test('t', async () => {});",
      '});',
      '',
    ].join('\n'),
    1,
    ['E_IMPORT'],
  ],
  [
    'a direct page action in a spec (rule 10) is refused, not classified',
    spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async ({ page }) => { await page.click('#x'); });",
        '});',
      ].join('\n'),
    ),
    1,
    ['E_DIRECT_UI'],
  ],
  [
    'unsupported: a describe whose callback takes a parameter',
    spec(["test.describe('d', (arg) => {", "  runIfEnv(test, ['dev']);", '});'].join('\n')),
    1,
    ['E_DESCRIBE_FORM'],
  ],
  [
    'malformed: an unclosed brace stops at the parse error and reports nothing else',
    spec("test.describe('d', () => {"),
    1,
    ['E_PARSE'],
  ],
  ['malformed: an empty file has no describe', '', 1, ['E_NO_DESCRIBE']],
  [
    'malformed: bytes that are not UTF-8',
    Buffer.from([0x74, 0x65, 0xc3, 0x28, 0x0a]),
    1,
    ['E_UNREADABLE'],
  ],
  [
    'malformed: a file larger than 1 MiB',
    `//${'x'.repeat(1024 * 1024 + 1)}\n`,
    1,
    ['E_UNREADABLE'],
  ],
];

describe('check-env-gates fixtures (each in a new temp folder, outside test discovery)', () => {
  for (const [purpose, text, status, codes] of cases) {
    test(purpose, () => {
      const result = check(['--root', makeRoot({ 'case.spec.ts': text })]);
      assert.equal(result.status, status, result.out + result.err);
      assert.deepEqual(codesOf(result.out), codes, result.out);
      assert.equal(result.err, '');
    });
  }

  test('a sign-in or sign-out call outside envGuard is a NOTE, not a failure (owner decision)', () => {
    const text = spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  test('t', async ({ loginPage, freshApi }) => {",
        "    await loginPage.login('a', 'b');",
        '    await login(freshApi, user);',
        '    await loginPage.logout();',
        '  });',
        '});',
      ].join('\n'),
    );
    const result = check(['--root', makeRoot({ 'case.spec.ts': text })]);
    assert.equal(result.status, 0, result.out);
    assert.deepEqual(codesOf(result.out), []);
    assert.equal((result.out.match(/ NOTE session-unguarded /g) ?? []).length, 3);
    assert.match(result.out, /3 note\(s\)/);
  });

  test('output never repeats source text (a fake secret in a fixture stays out)', () => {
    const text = spec(
      [
        "test.describe('d', () => {",
        "  runIfEnv(test, ['dev']);",
        "  const password = 'hunter2-not-a-real-secret';",
        "  test('t', async ({ api }) => { await api.post('/x', { data: { password } }); });",
        '});',
      ].join('\n'),
    );
    const result = check(['--root', makeRoot({ 'case.spec.ts': text })]);
    assert.equal(result.status, 1);
    assert.equal((result.out + result.err).includes('hunter2'), false);
  });

  test('only *.spec.ts files are read; one bad file fails the run; clean files stay clean', () => {
    const root = makeRoot({
      'good.spec.ts': spec(VALID_READ_ONLY),
      'bad.spec.ts': spec("test.describe('d', () => {\n  test('t', async () => {});\n});"),
      'helper.ts': 'this is not typescript {{{',
    });
    const result = check(['--root', root]);
    assert.equal(result.status, 1);
    assert.deepEqual(codesOf(result.out), ['E_MISSING_DECL']);
    assert.match(result.out, /bad\.spec\.ts:\d+:\d+ E_MISSING_DECL/);
    assert.match(result.out, /2 spec file\(s\), 1 finding\(s\)/);
  });

  test('explicit files inside the root are checked alone', () => {
    const root = makeRoot({
      'good.spec.ts': spec(VALID_READ_ONLY),
      'bad.spec.ts': spec("test.describe('d', () => {\n  test('t', async () => {});\n});"),
    });
    const result = check(['--root', root, join(root, 'good.spec.ts')]);
    assert.equal(result.status, 0, result.out);
    assert.match(result.out, /1 spec file\(s\), 0 finding\(s\)/);
  });
});

describe('usage problems and empty input', () => {
  test('a root with no *.spec.ts file is a finding, never a silent pass', () => {
    const result = check(['--root', makeRoot({ 'notes.txt': 'nothing here' })]);
    assert.equal(result.status, 1);
    assert.deepEqual(codesOf(result.out), ['E_NO_SPECS']);
  });

  test('an empty --root value is refused', () => {
    const result = check(['--root', '']);
    assert.equal(result.status, 2);
    assert.match(result.err, /--root needs a non-empty directory/);
    assert.equal(result.out, '');
  });

  test('--root without a value is refused', () => {
    assert.equal(check(['--root']).status, 2);
  });

  test('a root that does not exist is refused', () => {
    const missing = join(makeRoot({}), 'nope');
    const result = check(['--root', missing]);
    assert.equal(result.status, 2);
    assert.match(result.err, /root directory does not exist/);
  });

  test('an unknown option is refused', () => {
    const result = check(['--fix']);
    assert.equal(result.status, 2);
    assert.match(result.err, /unknown option "--fix"/);
  });

  test('a spec file outside the root is refused', () => {
    const inside = makeRoot({ 'a.spec.ts': spec(VALID_READ_ONLY) });
    const outside = makeRoot({ 'b.spec.ts': spec(VALID_READ_ONLY) });
    const result = check(['--root', inside, join(outside, 'b.spec.ts')]);
    assert.equal(result.status, 2);
    assert.match(result.err, /outside the root/);
  });

  test('a file that is not a *.spec.ts is refused', () => {
    const root = makeRoot({ 'helper.ts': 'export {};' });
    const result = check(['--root', root, join(root, 'helper.ts')]);
    assert.equal(result.status, 2);
    assert.match(result.err, /only \*\.spec\.ts files/);
  });

  test('--help prints the usage and exits 0', () => {
    const result = check(['--help']);
    assert.equal(result.status, 0);
    assert.match(result.out, /^usage: node scripts\/check-env-gates\.mjs/);
  });
});

describe('the real suite and the guarded helpers', () => {
  test('tests/ has no finding; every note is a sign-in or sign-out', () => {
    const result = check([]);
    assert.equal(result.status, 0, result.out + result.err);
    assert.match(result.out, / 0 finding\(s\)/);
    for (const line of result.out.split('\n')) {
      if (line.includes(' NOTE ')) assert.match(line, / NOTE session-unguarded /);
    }
  });

  test('every helper that calls envGuard is on a list; every self-guarded entry really guards', async () => {
    const ts = (await import('typescript')).default;
    const files = [
      'tests/support/api.ts',
      'tests/support/store.ts',
      ...readdirSync(join(PROJECT, 'pages'))
        .filter((name) => name.endsWith('.ts'))
        .map((name) => `pages/${name}`),
    ];
    const guarding = new Set();
    for (const file of files) {
      const text = readFileSync(join(PROJECT, file), 'utf8');
      for (const name of guardingMembers(ts, file, text)) guarding.add(name);
    }
    const listed = new Set([
      ...API_HELPER_FUNCTIONS,
      ...OWNED_RECORD_MEMBERS,
      ...UI_WRITE_MEMBERS,
      ...SELF_GUARDED_MEMBERS,
    ]);
    const unlisted = [...guarding].filter((name) => !listed.has(name));
    assert.deepEqual(unlisted, [], 'add each of these to a list in scripts/check-env-gates.mjs');
    const notGuarding = [...SELF_GUARDED_MEMBERS].filter((name) => !guarding.has(name));
    assert.deepEqual(notGuarding, [], 'a self-guarded entry no longer calls envGuard itself');
  });
});
