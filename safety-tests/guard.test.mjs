// Isolated checks for scripts/hooks/guard.mjs (Week 2 Task 06). node:test, no browser, no network.
// Every case runs the real script by absolute path and passes a simulated hook event through the
// spawnSync `input` option. No edit is applied and no real file is opened or written.
// Secret samples are made up and assembled from pieces, so this file never contains a prefix whole.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../scripts/hooks/guard.mjs', import.meta.url));
const BLOCKED = 'guard: BLOCKED — ';
const BOM = '\uFEFF';

const SAMPLE = {
  slack: 'xo' + 'xb-' + '0000-FAKE-sample',
  atlassian: 'ATA' + 'TT' + '0000FAKEsample',
  aws: 'AK' + 'IA' + '0000FAKE0000FAKE',
  privateKey: '-'.repeat(5) + 'BEGIN PRIV' + 'ATE KEY' + '-'.repeat(5) + '\nFAKE\n',
};

const SPEC = 'tests/blog/sample.smoke.spec.ts';

/**
 * Runs the guard with `input` (object → JSON, string or Buffer as given; undefined → no stdin).
 * `env` is merged over process.env, so a case can set CLAUDE_PROJECT_DIR itself.
 */
function guard(input, env) {
  const options = { encoding: 'utf8', timeout: 10000, windowsHide: true };
  if (env !== undefined) options.env = { ...process.env, ...env };
  if (input === undefined) options.stdio = ['ignore', 'pipe', 'pipe'];
  else
    options.input =
      typeof input === 'object' && !Buffer.isBuffer(input) ? JSON.stringify(input) : input;
  const result = spawnSync(process.execPath, [GUARD], options);
  assert.equal(result.error, undefined);
  return result;
}

function edit(file_path, old_string, new_string, extra = {}) {
  return { tool_name: 'Edit', tool_input: { file_path, old_string, new_string, ...extra } };
}

function write(file_path, content) {
  return { tool_name: 'Write', tool_input: { file_path, content } };
}

function assertBlocked(result, reason) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, `${BLOCKED}${reason}\n`);
}

function assertAllowed(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

const protectedReason = (name) =>
  `${name} is a protected secret file (.env, .env.*, *.pem, *.key, *.p12, id_rsa, id_ed25519); ` +
  'do not edit it with Claude — ask the user to change it by hand, and put placeholders in .env.example.';
const secretReason = (name, kind) =>
  `the new text for ${name} looks like a secret (${kind}); ` +
  'remove it and read the value from an environment variable instead.';
const onlyReason = (name) =>
  `this change adds .only to ${name}; .only makes Playwright run only the focused tests — remove it.`;
const skipReason = (name) =>
  `this change adds .skip to ${name}; ` +
  'limit environments with runIfEnv(test, [...]) or ask the user before skipping a test.';
const fixmeReason = (name) =>
  `this change adds .fixme( to ${name}; .fixme skips the test — fix it, ` +
  'limit environments with runIfEnv(test, [...]), or ask the user before skipping a test.';
const failReason = (name) =>
  `this change adds .fail( to ${name}; .fail makes the test pass only when it fails — ` +
  'fix the test, or ask the user before marking it as expected to fail.';
const expectReason = (name, before, after) =>
  `this edit to ${name} reduces expect( calls from ${before} to ${after}; ` +
  'keep the assertions, or ask the user to approve removing them.';
const runIfEnvReason = (name, before, after) =>
  `this edit to ${name} reduces runIfEnv( calls from ${before} to ${after}; ` +
  "every spec keeps runIfEnv(test, ['dev']) as the first line of its top-level describe.";
const envGuardReason = (name, before, after) =>
  `this edit to ${name} reduces envGuard( calls from ${before} to ${after}; ` +
  'every data write must stay inside envGuard(() => …).';
const waitReason = (name) =>
  `this change adds waitForTimeout( to ${name}; a fixed wait only guesses the timing — ` +
  'wait for the condition the test needs instead, with a web-first assertion such as ' +
  'await expect(locator).toBeVisible() or await expect(page).toHaveURL(…).';
const runIfEnvWriteReason = (name) =>
  `this Write of ${name} under tests/ has no runIfEnv(test, ['dev']); ` +
  'add it as the first line of the top-level describe so the spec cannot run on prod.';

const NAME = 'sample.smoke.spec.ts';
const TWO_EXPECTS =
  "    await expect(blog.envBanner).toBeVisible();\n    await expect(blog.envBanner).toHaveText('DEVELOPMENT');\n";
const ONE_EXPECT = '    await expect(blog.envBanner).toBeVisible();\n';
const HARD_WAIT = '    await page.waitForTimeout(2000);\n';
const CONDITION = '    await expect(blog.articleCategories).not.toHaveCount(0);\n';
const RUN_DEV = "  runIfEnv(test, ['dev']);\n";

describe('quick sample', () => {
  test('protected-file write → 2', () => {
    assertBlocked(guard(write('.env', 'PLACEHOLDER=1\n')), protectedReason('.env'));
  });

  test('removed assertion → 2', () => {
    assertBlocked(guard(edit(SPEC, TWO_EXPECTS, ONE_EXPECT)), expectReason(NAME, 2, 1));
  });

  test('ordinary edit → 0', () => {
    assertAllowed(guard(edit(SPEC, '// old comment\n', '// new comment\n')));
  });
});

describe('check 1: protected filenames', () => {
  for (const [path, name] of [
    ['.env', '.env'],
    ['C:/proj/.env.local', '.env.local'],
    ['C:\\x\\certs\\SERVER.PEM', 'SERVER.PEM'],
    ['keys/signing.key', 'signing.key'],
    ['store/client.p12', 'client.p12'],
    ['C:\\Users\\me\\.ssh\\id_rsa', 'id_rsa'],
    ['/home/me/.ssh/id_ed25519', 'id_ed25519'],
    ['.ENV', '.ENV'],
  ]) {
    test(`blocked: ${path}`, () => {
      assertBlocked(guard(write(path, 'x')), protectedReason(name));
      assertBlocked(guard(edit(path, 'a', 'b')), protectedReason(name));
    });
  }

  for (const path of [
    '.env.example',
    'C:\\proj\\.env.example',
    'id_rsa.pub',
    'env/notes.ts',
    'notes.key.md',
    '.envrc',
  ]) {
    test(`allowed: ${path}`, () => {
      assertAllowed(guard(write(path, 'PLACEHOLDER=1\n')));
    });
  }
});

describe('check 2: secret-looking new text', () => {
  for (const [key, kind] of [
    ['slack', 'Slack bot token'],
    ['atlassian', 'Atlassian API token'],
    ['aws', 'AWS access key ID'],
    ['privateKey', 'private key block'],
  ]) {
    test(`blocked: ${kind} in Write and Edit`, () => {
      assertBlocked(
        guard(write('notes/config.md', `token: ${SAMPLE[key]}\n`)),
        secretReason('config.md', kind),
      );
      assertBlocked(
        guard(edit('notes/config.md', 'token: TODO', `token: ${SAMPLE[key]}`)),
        secretReason('config.md', kind),
      );
    });
  }

  test('blocked: .env.example is exempt from the filename check only', () => {
    assertBlocked(
      guard(write('.env.example', `API_TOKEN=${SAMPLE.atlassian}\n`)),
      secretReason('.env.example', 'Atlassian API token'),
    );
  });

  test('allowed: an edit that removes a sample from the old text', () => {
    assertAllowed(
      guard(edit('notes/config.md', `token: ${SAMPLE.aws}`, 'token: read from APP_TOKEN')),
    );
  });

  test('allowed: ordinary text', () => {
    assertAllowed(guard(write('notes/config.md', 'token: read from APP_TOKEN\n')));
  });
});

describe('check 3: .only added to a spec', () => {
  test('blocked: Edit adds test.only(', () => {
    assertBlocked(
      guard(edit(SPEC, "  test('a', async () => {", "  test.only('a', async () => {")),
      onlyReason(NAME),
    );
  });

  test('allowed: .only already in the old text', () => {
    assertAllowed(guard(edit(SPEC, "test.only('a', () => {});", "test.only('b', () => {});")));
  });

  test('allowed: Edit removes .only', () => {
    assertAllowed(guard(edit(SPEC, "test.only('a', () => {});", "test('a', () => {});")));
  });

  test('allowed: .only in a file that is not *.spec.ts', () => {
    assertAllowed(guard(edit('README.md', 'Run one test.', 'Never commit test.only.')));
  });
});

describe('check 4: .skip added to a spec', () => {
  test('blocked: Edit adds test.skip(', () => {
    assertBlocked(
      guard(edit(SPEC, "  test('a', async () => {", "  test.skip('a', async () => {")),
      skipReason(NAME),
    );
  });

  test('allowed: Edit removes .skip', () => {
    assertAllowed(guard(edit(SPEC, "test.skip('a', () => {});", "test('a', () => {});")));
  });

  test('allowed: .skip in a file that is not *.spec.ts', () => {
    assertAllowed(guard(edit('notes/helper.ts', '// old', '// calls test.skip(...)')));
  });

  test('blocked: Edit adds test.fixme(', () => {
    assertBlocked(
      guard(edit(SPEC, "  test('a', async () => {", "  test.fixme('a', async () => {")),
      fixmeReason(NAME),
    );
  });

  test('blocked: Edit adds test.describe.fixme(', () => {
    assertBlocked(
      guard(edit(SPEC, "test.describe('a', () => {", "test.describe.fixme('a', () => {")),
      fixmeReason(NAME),
    );
  });

  test('blocked: Edit adds test.fail(', () => {
    assertBlocked(
      guard(edit(SPEC, "  test('a', async () => {", "  test.fail('a', async () => {")),
      failReason(NAME),
    );
  });

  test('blocked: a Write of a spec containing .fixme(', () => {
    assertBlocked(guard(write(SPEC, `${RUN_DEV}test.fixme('a', () => {});\n`)), fixmeReason(NAME));
  });

  test('allowed: Edit removes .fixme(', () => {
    assertAllowed(guard(edit(SPEC, "test.fixme('a', () => {});", "test('a', () => {});")));
  });

  test('allowed: Edit adds response.failure() (no .fail( call)', () => {
    assertAllowed(
      guard(edit(SPEC, '    // check\n', '    expect(response.failure()).toBeNull();\n')),
    );
  });

  test('allowed: .fixme( in a file that is not *.spec.ts', () => {
    assertAllowed(guard(edit('README.md', 'Skipped tests.', 'Avoid test.fixme( in specs.')));
  });
});

describe('check 5: fewer expect( calls in an Edit', () => {
  test('blocked: a separate assertion deletion', () => {
    assertBlocked(guard(edit(SPEC, ONE_EXPECT, '')), expectReason(NAME, 1, 0));
  });

  test('allowed: one combined edit moving an assertion keeps its count', () => {
    const old = `    const blog = new BlogListPage(page);\n${ONE_EXPECT}    await blog.open();\n`;
    const moved = `    const blog = new BlogListPage(page);\n    await blog.open();\n${ONE_EXPECT}`;
    assertAllowed(guard(edit(SPEC, old, moved)));
  });

  test('allowed: adding an assertion', () => {
    assertAllowed(guard(edit(SPEC, ONE_EXPECT, TWO_EXPECTS)));
  });

  test('allowed: fewer expect( in a file that is not *.spec.ts', () => {
    assertAllowed(guard(edit('notes/helper.ts', ONE_EXPECT, '')));
  });
});

describe('check 6: fewer runIfEnv( or envGuard( calls in an Edit (counted separately)', () => {
  const RUN = "  runIfEnv(test, ['dev']);\n";
  const GUARD_CALL = '    await envGuard(() => categories.create(name));\n';

  test('blocked: runIfEnv( −1 although envGuard( +1', () => {
    assertBlocked(guard(edit(SPEC, RUN, GUARD_CALL)), runIfEnvReason(NAME, 1, 0));
  });

  test('blocked: envGuard( −1 although runIfEnv( +1', () => {
    assertBlocked(guard(edit(SPEC, GUARD_CALL, RUN)), envGuardReason(NAME, 1, 0));
  });

  test('allowed: both counts unchanged', () => {
    assertAllowed(guard(edit(SPEC, RUN + GUARD_CALL, `${RUN}  // comment\n${GUARD_CALL}`)));
  });
});

describe('check 7: waitForTimeout( added to a spec', () => {
  test('blocked: Edit adds a fixed wait', () => {
    assertBlocked(guard(edit(SPEC, ONE_EXPECT, ONE_EXPECT + HARD_WAIT)), waitReason(NAME));
  });

  test('allowed: Edit adds a condition-based wait', () => {
    assertAllowed(guard(edit(SPEC, ONE_EXPECT, ONE_EXPECT + CONDITION)));
  });

  test('allowed: Edit replaces the fixed wait with the condition', () => {
    assertAllowed(guard(edit(SPEC, HARD_WAIT, CONDITION)));
  });

  test('gap, allowed: waitForTimeout( already in the old text', () => {
    assertAllowed(guard(edit(SPEC, HARD_WAIT, HARD_WAIT + HARD_WAIT)));
  });

  test('allowed: waitForTimeout( in a file that is not *.spec.ts', () => {
    assertAllowed(guard(edit('pages/LoginPage.ts', '// old', HARD_WAIT)));
  });
});

describe('Write (whole file, no old-text baseline)', () => {
  test('blocked: .only in a new spec (old text treated as empty)', () => {
    assertBlocked(guard(write(SPEC, "test.only('a', () => {});\n")), onlyReason(NAME));
  });

  test('blocked: .skip in a new spec (old text treated as empty)', () => {
    assertBlocked(guard(write(SPEC, "test.skip('a', () => {});\n")), skipReason(NAME));
  });

  test('blocked: a Write of a tests/ spec with no runIfEnv( (check 8 closes the earlier gap)', () => {
    assertBlocked(
      guard(write(SPEC, "import { test } from '@playwright/test';\ntest('a', async () => {});\n")),
      runIfEnvWriteReason(NAME),
    );
  });

  test('gap, allowed: a Write with runIfEnv but no expect( is not checked for removals', () => {
    assertAllowed(
      guard(
        write(
          SPEC,
          `import { test } from '@playwright/test';\n${RUN_DEV}test('a', async () => {});\n`,
        ),
      ),
    );
  });

  test('blocked: a Write of a spec containing a fixed wait (whole content checked)', () => {
    assertBlocked(
      guard(write(SPEC, `test('a', async ({ page }) => {\n${HARD_WAIT}});\n`)),
      waitReason(NAME),
    );
  });

  test('allowed: a Write of a spec with a condition-based wait', () => {
    assertAllowed(
      guard(write(SPEC, `${RUN_DEV}test('a', async ({ page }) => {\n${CONDITION}});\n`)),
    );
  });
});

describe("check 8: a Write of a tests/ spec must contain runIfEnv(test, ['dev'])", () => {
  const BARE = "test('a', async () => {});\n";
  const ROOT = { CLAUDE_PROJECT_DIR: 'C:/proj' };

  test('blocked: relative tests/ path without runIfEnv', () => {
    assertBlocked(guard(write(SPEC, BARE)), runIfEnvWriteReason(NAME));
  });

  test('blocked: absolute path under the root (case and slashes differ)', () => {
    assertBlocked(
      guard(write('C:\\Proj\\Tests\\blog\\x.spec.ts', BARE), ROOT),
      runIfEnvWriteReason('x.spec.ts'),
    );
  });

  test('allowed: tests/ spec containing runIfEnv', () => {
    assertAllowed(guard(write(SPEC, RUN_DEV + BARE)));
  });

  test('allowed: safety/ spec without runIfEnv (outside tests/)', () => {
    assertAllowed(guard(write('safety/x.safety.spec.ts', BARE)));
  });

  test('allowed: tests/../safety/ is normalised to safety/', () => {
    assertAllowed(guard(write('tests/../safety/x.spec.ts', BARE)));
  });

  test('gap, allowed: absolute path outside the root is not placed', () => {
    assertAllowed(guard(write('D:/elsewhere/tests/x.spec.ts', BARE), ROOT));
  });

  test('blocked: double-quoted runIfEnv(test, ["dev"]) is not the exact form', () => {
    assertBlocked(
      guard(write(SPEC, `  runIfEnv(test, ["dev"]);\n${BARE}`)),
      runIfEnvWriteReason(NAME),
    );
  });
});

describe('order: the first matching check gives the one reason', () => {
  test('protected filename before secret text', () => {
    assertBlocked(guard(write('.env', `TOKEN=${SAMPLE.slack}\n`)), protectedReason('.env'));
  });

  test('.only before a removed assertion', () => {
    assertBlocked(guard(edit(SPEC, ONE_EXPECT, "test.only('a', () => {});")), onlyReason(NAME));
  });

  test('removed assertion before removed runIfEnv(', () => {
    assertBlocked(
      guard(edit(SPEC, `  runIfEnv(test, ['dev']);\n${ONE_EXPECT}`, '')),
      expectReason(NAME, 1, 0),
    );
  });

  test('.only before a missing runIfEnv in a Write', () => {
    assertBlocked(guard(write(SPEC, "test.only('a', () => {});\n")), onlyReason(NAME));
  });

  test('removed assertion before added waitForTimeout(', () => {
    assertBlocked(guard(edit(SPEC, ONE_EXPECT, HARD_WAIT)), expectReason(NAME, 1, 0));
  });
});

describe('byte-order marks', () => {
  const blocking = JSON.stringify(write('.env', 'x'));
  const allowed = JSON.stringify(write('notes.md', 'x'));

  for (const [label, prefix] of [
    ['one BOM', BOM],
    ['three BOMs', BOM.repeat(3)],
  ]) {
    test(`${label} before a blocking event → 2`, () => {
      assertBlocked(guard(prefix + blocking), protectedReason('.env'));
    });
    test(`${label} before an allowed event → 0`, () => {
      assertAllowed(guard(prefix + allowed));
    });
  }

  test('raw bytes EF BB BF before a blocking event → 2', () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(blocking, 'utf8')]);
    assertBlocked(guard(bytes), protectedReason('.env'));
  });
});

describe('malformed or unrelated input fails open: exit 0, no output', () => {
  for (const [label, input] of [
    ['not JSON', 'not json {'],
    ['empty string', ''],
    ['array', '[]'],
    ['null', 'null'],
    ['number', '42'],
    ['no tool_input', JSON.stringify({ tool_name: 'Write' })],
    ['tool_input null', JSON.stringify({ tool_name: 'Edit', tool_input: null })],
    [
      'file_path not a string',
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 7, content: 'x' } }),
    ],
    [
      'empty file_path',
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '  ', content: 'x' } }),
    ],
    [
      'content not a string',
      JSON.stringify({ tool_name: 'Write', tool_input: { file_path: SPEC, content: { a: 1 } } }),
    ],
    ['old_string not a string', JSON.stringify(edit(SPEC, ['expect('], ''))],
    [
      'unknown tool_name',
      JSON.stringify({ tool_name: 'Bash', tool_input: { file_path: '.env', command: 'x' } }),
    ],
    ['missing tool_name', JSON.stringify({ tool_input: { file_path: '.env', content: 'x' } })],
  ]) {
    test(label, () => {
      assertAllowed(guard(input));
    });
  }

  test('no stdin', () => {
    assertAllowed(guard(undefined));
  });
});

// Task 09: own copy of CRITICAL_PATHS in scripts/hooks/guard.mjs and of the CRITICAL row in
// .claude/rules/01-guardrails.md. Removing a path from the guard fails a case here.
const CRITICAL = [
  'playwright.config.ts',
  'playwright.safety.config.ts',
  'tsconfig.json',
  'package.json',
  'eslint.config.mjs',
  '.prettierrc.json',
  '.gitignore',
  'env/target.ts',
  'env/runIfEnv.ts',
  'env/envGuard.ts',
  'tests/support/env.ts',
  'tests/support/users.ts',
  '.claude/settings.json',
  '.husky/pre-commit',
  '.husky/pre-push',
  'scripts/hooks/guard.mjs',
  'scripts/hooks/secret-scan.mjs',
  'scripts/hooks/pre-push-check.mjs',
  'scripts/hooks/session-preflight.mjs',
  'scripts/hooks/stop-worklog.mjs',
  'scripts/vault-sync.mjs',
  '.claude/hooks/fleet-log.mjs',
];
const WARNING = 'guard: WARN — shared file; review the affected callers before approving';

/** Exit 0, nothing on stderr, exactly one JSON line with only the reminder (no permissionDecision). */
function assertWarned(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    systemMessage: WARNING,
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: WARNING },
  });
}

describe('Task 09: listed CRITICAL paths get a reminder after the refusal checks', () => {
  const ROOT = { CLAUDE_PROJECT_DIR: 'C:/proj' };

  for (const path of CRITICAL) {
    test(`warned: Edit of ${path}`, () => {
      assertWarned(guard(edit(path, '// old', '// new')));
    });
  }

  test('warned: Write of a listed path', () => {
    assertWarned(guard(write('playwright.config.ts', '// whole file\n')));
  });

  test('warned: absolute Windows path under the root (case and slashes differ)', () => {
    assertWarned(guard(edit('C:\\Proj\\ENV\\Target.ts', '// old', '// new'), ROOT));
  });

  test('warned: ./ and .. are normalised to the listed path', () => {
    assertWarned(guard(edit('./env/target.ts', '// old', '// new')));
    assertWarned(guard(edit('tests/../env/target.ts', '// old', '// new')));
  });

  test('warned: without CLAUDE_PROJECT_DIR, an absolute path in the guard’s own project', () => {
    const own = fileURLToPath(new URL('../env/target.ts', import.meta.url));
    assertWarned(guard(edit(own, '// old', '// new'), { CLAUDE_PROJECT_DIR: '' }));
  });

  test('check 8 keeps its placement: without CLAUDE_PROJECT_DIR an absolute tests/ spec is not placed', () => {
    const own = fileURLToPath(new URL('../tests/blog/x.spec.ts', import.meta.url));
    assertAllowed(guard(write(own, "test('a', async () => {});\n"), { CLAUDE_PROJECT_DIR: '' }));
  });

  test('warned, not blocked: spec-only checks do not apply to a listed non-spec file', () => {
    assertWarned(guard(edit('env/runIfEnv.ts', ONE_EXPECT, '// test.only test.skip(\n')));
  });
});

describe('Task 09: ordinary edits stay silent', () => {
  const ROOT = { CLAUDE_PROJECT_DIR: 'C:/proj' };

  for (const path of [
    'pages/LoginPage.ts',
    'pages/BasePage.ts',
    SPEC,
    'safety/target.safety.spec.ts',
    '.claude/rules/01-guardrails.md',
    'evidence/task09-note.md',
  ]) {
    test(`silent: Edit of ${path} (not listed)`, () => {
      assertAllowed(guard(edit(path, '// old', '// new')));
    });
  }

  for (const path of [
    'env/target.ts.bak',
    'env/targets.ts',
    'other/env/target.ts',
    'tests/support/env.ts.orig',
  ]) {
    test(`silent: lookalike ${path}`, () => {
      assertAllowed(guard(edit(path, '// old', '// new')));
    });
  }

  test('gap, silent: absolute path outside the root', () => {
    assertAllowed(guard(edit('D:/elsewhere/env/target.ts', '// old', '// new'), ROOT));
  });

  test('silent: without CLAUDE_PROJECT_DIR, an absolute path outside the guard’s own project', () => {
    assertAllowed(
      guard(edit('C:/proj/env/target.ts', '// old', '// new'), { CLAUDE_PROJECT_DIR: '' }),
    );
  });

  test('silent: a tool other than Edit or Write on a listed path', () => {
    assertAllowed(guard({ tool_name: 'Read', tool_input: { file_path: 'env/target.ts' } }));
  });
});

describe('Task 09: a refusal keeps priority over the reminder', () => {
  test('Edit of a listed path adding a secret → 2, no JSON', () => {
    assertBlocked(
      guard(edit('env/target.ts', '// old', `// ${SAMPLE.aws}`)),
      secretReason('target.ts', 'AWS access key ID'),
    );
  });

  test('Write of a listed path adding a secret → 2, no JSON', () => {
    assertBlocked(
      guard(write('.claude/settings.json', SAMPLE.privateKey)),
      secretReason('settings.json', 'private key block'),
    );
  });
});
