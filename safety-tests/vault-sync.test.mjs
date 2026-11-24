// Isolated checks for the spec-note generator: `node scripts/vault-sync.mjs --write | --check`
// and scripts/vault-notes.mjs (Week 2 Task 11, stage 1). node:test, no browser, no network.
//
// Fixture root, and how the file proves it is the one used:
//   - Every case builds its own folder under the OS temp directory and passes it to the real script
//     as VAULT_SYNC_ROOT (an explicit, injected root). CLAUDE_PROJECT_DIR and GIT_* are removed.
//   - The script lives in this project, and every case runs it with the working folder set to a
//     different, empty temp folder (CWD). A script that took its root from its own location or from
//     the working folder would read and write somewhere other than the fixture.
//   - Each --write/--check run prints "vault-sync: root <path>" first; every case compares that
//     line with the fixture it built (assertRoot).
//   - The four real specs are copied into fixtures as input. The real project is otherwise only
//     read: before() and after() hash every file under the real tests/, pages/ and vault/ (except
//     vault/_changelog/, which other Claude sessions append to) and require identical results, and
//     after() requires CWD to be still empty.
//   - The two fallbacks (CLAUDE_PROJECT_DIR, then the working folder) are exercised with a fixture
//     too, never with the real project.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(PROJECT, 'scripts', 'vault-sync.mjs');
const START = '<!-- generated:start -->';
const END = '<!-- generated:end -->';
const CURRENT_SPECS = [
  'tests/blog/article-detail.smoke.spec.ts',
  'tests/blog/categories.smoke.spec.ts',
  'tests/blog/category-filter.smoke.spec.ts',
  'tests/blog/home.smoke.spec.ts',
];
const HOME = 'tests/blog/home.smoke.spec.ts';
const HOME_NOTE = 'vault/tests/blog/home.smoke.md';

const LINKS = join(PROJECT, 'scripts', 'vault-links.mjs');

const temps = [];
let CWD;
let EMPTY_GITCONFIG;
let projectBefore;

/** sha256 of every file under the given real-project folders, as { relPath: hash }. */
function snapshot(base, folders, skip = []) {
  const hashes = {};
  const walk = (rel) => {
    const abs = join(base, rel);
    if (!existsSync(abs)) return;
    if (skip.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) return;
    if (statSync(abs).isDirectory()) {
      for (const name of readdirSync(abs).sort()) walk(rel ? `${rel}/${name}` : name);
    } else {
      hashes[rel] = createHash('sha256').update(readFileSync(abs)).digest('hex');
    }
  };
  for (const folder of folders) walk(folder);
  return hashes;
}

const projectSnapshot = () => snapshot(PROJECT, ['tests', 'pages', 'vault'], ['vault/_changelog']);

before(() => {
  projectBefore = projectSnapshot();
  CWD = makeTemp('vault-sync-cwd-');
  EMPTY_GITCONFIG = join(makeTemp('vault-sync-gitconfig-'), 'empty.gitconfig');
  writeFileSync(EMPTY_GITCONFIG, '');
});

after(() => {
  assert.deepEqual(readdirSync(CWD), [], 'nothing may be written to the working folder');
  assert.deepEqual(projectSnapshot(), projectBefore, 'the real project must not change');
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  for (const dir of temps) assert.equal(existsSync(dir), false, `temp folder removed: ${dir}`);
});

function makeTemp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  const fromProject = relative(PROJECT, dir);
  assert.ok(
    fromProject.startsWith('..') || resolve(fromProject) === fromProject,
    'temp folder is outside the project',
  );
  assert.ok(relative(dir, PROJECT).startsWith('..'), 'the project is not inside the temp folder');
  return dir;
}

/** A fixture root with copies of the given real specs and of every real Page Object. */
function makeFixture(specs = CURRENT_SPECS) {
  const root = makeTemp('vault-sync-root-');
  for (const spec of specs) {
    mkdirSync(join(root, dirname(spec)), { recursive: true });
    copyFileSync(join(PROJECT, spec), join(root, spec));
  }
  mkdirSync(join(root, 'pages'));
  for (const name of readdirSync(join(PROJECT, 'pages'))) {
    copyFileSync(join(PROJECT, 'pages', name), join(root, 'pages', name));
  }
  return root;
}

/** The environment without anything that could point at the real project or Git setup. */
function isolatedEnv(root, extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (upper === 'CLAUDE_PROJECT_DIR' || upper === 'VAULT_SYNC_ROOT' || upper.startsWith('GIT_')) {
      continue;
    }
    env[key] = value;
  }
  return {
    ...env,
    ...(root === undefined ? {} : { VAULT_SYNC_ROOT: root }),
    GIT_CEILING_DIRECTORIES: dirname(root ?? CWD),
    GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG,
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  };
}

function run(root, args, { cwd = CWD, env, input } = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    input,
    env: env ?? isolatedEnv(root),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The run used the fixture: its first stdout line names exactly this root. */
function assertRoot(result, root) {
  assert.equal(result.stdout.split('\n')[0], `vault-sync: root ${root}`);
}

const write = (root, ...files) =>
  run(root, ['--write', ...(files.length ? ['--files', ...files] : [])]);
const check = (root, ...files) =>
  run(root, ['--check', ...(files.length ? ['--files', ...files] : [])]);
const read = (root, rel) => readFileSync(join(root, rel));
const readText = (root, rel) => readFileSync(join(root, rel), 'utf8');
const put = (root, rel, content) => {
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};
/** Every file under the fixture with its bytes and modification time. */
function tree(root) {
  const files = {};
  const walk = (rel) => {
    for (const name of readdirSync(join(root, rel)).sort()) {
      const child = rel ? `${rel}/${name}` : name;
      const info = statSync(join(root, child));
      if (info.isDirectory()) walk(child);
      else
        files[child] = {
          bytes: readFileSync(join(root, child)).toString('base64'),
          mtime: info.mtimeMs,
        };
    }
  };
  walk('');
  return files;
}

/** The lines between the markers of a note. */
function blockOf(text) {
  const lines = text.split(/\r?\n/);
  return lines.slice(lines.indexOf(START) + 1, lines.indexOf(END));
}

const HEADER =
  "import { expect, test } from '@playwright/test';\nimport { runIfEnv } from '../env/runIfEnv';\n\n";
/** A spec with one dev-only describe holding `body`. */
const spec = (body) =>
  `${HEADER}test.describe('fixture (dev only)', () => {\n  runIfEnv(test, ['dev']);\n${body}\n});\n`;
const ONE_TEST =
  "  test('one', async ({ page }) => {\n    await expect(page).toHaveURL(/x/);\n  });";

// ---------------------------------------------------------------------------------------------

describe('fixture root is the one the script uses', () => {
  test('VAULT_SYNC_ROOT is used even though the working folder is elsewhere', () => {
    const root = makeFixture();
    const result = write(root);
    assert.equal(result.status, 0, result.stderr);
    assertRoot(result, root);
    for (const specPath of CURRENT_SPECS) {
      const note = specPath.replace(/^tests\//, 'vault/tests/').replace(/\.spec\.ts$/, '.md');
      assert.ok(existsSync(join(root, note)), note);
    }
    assert.deepEqual(readdirSync(CWD), []);
  });

  test('without VAULT_SYNC_ROOT, CLAUDE_PROJECT_DIR selects the fixture', () => {
    const root = makeFixture([HOME]);
    const result = run(undefined, ['--check'], {
      env: isolatedEnv(undefined, { CLAUDE_PROJECT_DIR: root }),
    });
    assertRoot(result, root);
    assert.match(result.stderr, /missing vault\/tests\/blog\/home\.smoke\.md/);
  });

  test('with neither variable set, the working folder is the root (here: a fixture)', () => {
    const root = makeFixture([HOME]);
    const result = run(undefined, ['--write'], { cwd: root, env: isolatedEnv(undefined) });
    assert.equal(result.status, 0, result.stderr);
    assertRoot(result, root);
    assert.ok(existsSync(join(root, HOME_NOTE)));
  });
});

describe('generator lifecycle', () => {
  test('missing note -> --write creates it -> --check is clean', () => {
    const root = makeFixture();
    const first = check(root);
    assert.equal(first.status, 1);
    assertRoot(first, root);
    assert.equal((first.stderr.match(/^vault-sync: missing /gm) ?? []).length, 4);
    assert.equal(existsSync(join(root, 'vault')), false, '--check wrote nothing');

    const created = write(root);
    assert.equal(created.status, 0, created.stderr);
    assert.match(created.stdout, /4 spec path\(s\), 4 created, 0 updated, 0 unchanged/);

    const clean = check(root);
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(clean.stderr, '');
    assert.match(clean.stdout, /4 spec path\(s\), 4 fresh, 0 deleted with no note, 0 failed/);
  });

  test('a harmless comment in the fixture source -> stale -> refresh -> clean', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    const before = readText(root, HOME_NOTE);
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// harmless fixture comment\n`);

    const stale = check(root);
    assert.equal(stale.status, 1);
    assert.match(
      stale.stderr,
      /^vault-sync: stale vault\/tests\/blog\/home\.smoke\.md: source changed$/m,
    );
    assert.equal((stale.stderr.match(/^vault-sync: /gm) ?? []).length, 1, 'only the changed spec');

    const refreshed = write(root);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.match(refreshed.stdout, /^vault-sync: updated vault\/tests\/blog\/home\.smoke\.md$/m);
    assert.match(refreshed.stdout, /0 created, 1 updated, 3 unchanged/);
    const afterText = readText(root, HOME_NOTE);
    const changed = blockOf(afterText).filter((line, i) => line !== blockOf(before)[i]);
    assert.equal(changed.length, 2, 'only the source hash and the block hash change');
    assert.match(changed[0], /^- \*\*SHA-256 \(LF-normalised\):\*\* `[0-9a-f]{64}`$/);
    assert.match(changed[1], /^- \*\*Block SHA-256:\*\* `[0-9a-f]{64}`$/);

    assert.equal(check(root).status, 0);
  });

  test('a second refresh produces no diff and rewrites nothing', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    const first = tree(root);
    const second = write(root);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /0 created, 0 updated, 4 unchanged/);
    assert.deepEqual(tree(root), first, 'same bytes and same modification times');
  });

  test('CRLF and LF copies of a spec give the same note', () => {
    const lf = makeFixture([HOME]);
    const crlf = makeFixture([HOME]);
    const text = readText(lf, HOME).replace(/\r\n/g, '\n');
    writeFileSync(join(lf, HOME), text);
    writeFileSync(join(crlf, HOME), `\uFEFF${text.replace(/\n/g, '\r\n')}`);
    assert.equal(write(lf).status, 0);
    assert.equal(write(crlf).status, 0);
    assert.deepEqual(read(crlf, HOME_NOTE), read(lf, HOME_NOTE));
  });

  test('--check never writes, whatever the state', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// stale\n`);
    rmSync(join(root, 'vault/tests/blog/categories.smoke.md'));
    rmSync(join(root, 'tests/blog/category-filter.smoke.spec.ts'));
    put(root, 'vault/tests/blog/article-detail.smoke.md', '# no markers\n');
    const before = tree(root);
    const result = check(root);
    assert.equal(result.status, 1);
    for (const status of ['stale', 'missing', 'source-missing', 'invalid']) {
      assert.match(result.stderr, new RegExp(`^vault-sync: ${status} `, 'm'), status);
    }
    assert.deepEqual(tree(root), before);
  });
});

describe('notes for the current specs', () => {
  const expected = {
    'tests/blog/home.smoke.spec.ts': {
      titles: [
        '  - `blog home smoke (dev only)`',
        '    - `the banner is visible and identifies DEVELOPMENT`',
        '    - `the first article card is visible and at least one card exists`',
      ],
      imports: ['  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)'],
    },
    'tests/blog/article-detail.smoke.spec.ts': {
      titles: [
        '  - `article detail smoke (dev only)`',
        '    - `opening the first article card shows its detail page with the same title`',
      ],
      imports: [
        '  - `ArticleDetailPage` — [pages/ArticleDetailPage.ts](../../../pages/ArticleDetailPage.ts)',
        '  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)',
      ],
    },
    'tests/blog/category-filter.smoke.spec.ts': {
      titles: [
        '  - `blog category filter smoke (dev only)`',
        '    - `filtering by the Playwright category shows only Playwright articles`',
      ],
      imports: ['  - `BlogListPage` — [pages/BlogListPage.ts](../../../pages/BlogListPage.ts)'],
    },
    'tests/blog/categories.smoke.spec.ts': {
      titles: [
        '  - `categories smoke (dev only)`',
        '    - `a signed-in author sees the category list with at least one item`',
      ],
      imports: [
        '  - `CategoriesPage` — [pages/CategoriesPage.ts](../../../pages/CategoriesPage.ts)',
        '  - `LoginPage` — [pages/LoginPage.ts](../../../pages/LoginPage.ts)',
      ],
    },
  };

  for (const [specPath, { titles, imports }] of Object.entries(expected)) {
    test(`${specPath}: source, hash, parser status, literal titles and Page Object imports`, () => {
      const root = makeFixture([specPath]);
      assert.equal(write(root).status, 0);
      const note = specPath.replace(/^tests\//, 'vault/tests/').replace(/\.spec\.ts$/, '.md');
      const text = readText(root, note);
      const hash = createHash('sha256')
        .update(
          readText(root, specPath)
            .replace(/^\uFEFF/, '')
            .replace(/\r\n/g, '\n'),
        )
        .digest('hex');
      const name = specPath.split('/').at(-1);
      assert.deepEqual(blockOf(text).slice(0, -1), [
        `- **Source:** [${specPath}](../../../${specPath})`,
        `- **SHA-256 (LF-normalised):** \`${hash}\``,
        '- **Parser:** typescript — ok',
        '- **Titles:**',
        ...titles,
        '- **Page Object imports:**',
        ...imports,
      ]);
      assert.ok(text.startsWith(`---\nid: tests-blog-`), 'front matter on a new note');
      assert.ok(text.includes(`\n# ${name}\n`));
      assert.ok(text.includes('\n## About this test\n'), 'a place for the human explanation');
      assert.equal(text.includes('AUTHOR'), false, 'shared data imports are not Page Objects');
    });
  }
});

describe('human text outside the markers', () => {
  test('survives a refresh byte-for-byte (BOM, CRLF, Unicode, no final newline)', () => {
    const root = makeFixture([HOME]);
    assert.equal(write(root).status, 0);
    const block = blockOf(readText(root, HOME_NOTE));
    const prefix = '\uFEFF---\r\nid: hand\r\n---\r\n\r\n# Ünïcode ✓ — kept\r\n\r\nIntro  \r\n\r\n';
    const suffix =
      '\r\n\r\n## About\r\n\r\n<!-- a human comment -->\r\nMixed\nendings\r\nand no final newline';
    put(root, HOME_NOTE, prefix + [START, ...block, END].join('\r\n') + suffix);
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// change\n`);

    const result = write(root);
    assert.equal(result.status, 0, result.stderr);
    const bytes = read(root, HOME_NOTE);
    assert.deepEqual(bytes.subarray(0, Buffer.byteLength(prefix)), Buffer.from(prefix));
    assert.deepEqual(bytes.subarray(bytes.length - Buffer.byteLength(suffix)), Buffer.from(suffix));
    const middle = bytes
      .subarray(Buffer.byteLength(prefix), bytes.length - Buffer.byteLength(suffix))
      .toString('utf8');
    assert.ok(middle.startsWith(`${START}\r\n`) && middle.endsWith(END));
    assert.equal(middle.replace(/\r\n/g, '').includes('\n'), false, 'block keeps CRLF');
    assert.equal(check(root).status, 0);
  });

  test('a hand edit inside the block is refused, not overwritten', () => {
    const root = makeFixture([HOME]);
    assert.equal(write(root).status, 0);
    const edited = readText(root, HOME_NOTE).replace('- **Titles:**', '- **Titles:** (my note)');
    put(root, HOME_NOTE, edited);
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// change\n`);
    const before = read(root, HOME_NOTE);

    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid vault\/tests\/blog\/home\.smoke\.md: hand edit inside/);
    assert.match(result.stdout, /1 failed; nothing written/);
    assert.deepEqual(read(root, HOME_NOTE), before);
    assert.equal(check(root).status, 1);
  });
});

describe('damaged or repeated markers are refused', () => {
  const variants = {
    'missing end': (t) => t.replace(`${END}\n`, ''),
    'missing start': (t) => t.replace(`${START}\n`, ''),
    'two start lines': (t) => t.replace(END, `${START}\n${END}`),
    'two blocks': (t) => `${t}\n${t.slice(t.indexOf(START), t.indexOf(END) + END.length)}\n`,
    'end before start': (t) => t.replace(START, 'TMP').replace(END, START).replace('TMP', END),
    'indented marker': (t) => t.replace(START, `  ${START}`),
    'text after a marker': (t) => t.replace(END, `${END} keep`),
    'marker mentioned in prose': (t) => `${t}See <!-- generated:end --> above.\n`,
    'no markers at all': () => '# A hand-written note\n',
  };
  for (const [name, damage] of Object.entries(variants)) {
    test(name, () => {
      const root = makeFixture([HOME]);
      assert.equal(write(root).status, 0);
      put(root, HOME_NOTE, damage(readText(root, HOME_NOTE)));
      writeFileSync(join(root, HOME), `${readText(root, HOME)}// change\n`);
      const before = read(root, HOME_NOTE);

      const result = write(root);
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /^vault-sync: invalid vault\/tests\/blog\/home\.smoke\.md: /m);
      assert.match(result.stdout, /nothing written/);
      assert.deepEqual(read(root, HOME_NOTE), before, 'file unchanged');
      assert.equal(check(root).status, 1);
    });
  }
});

describe('difficult input fails honestly and writes nothing', () => {
  const cases = {
    'test.describe.serial wrapper': [
      'unsupported',
      `${HEADER}test.describe.serial('d', () => {\n  runIfEnv(test, ['dev']);\n${ONE_TEST}\n});\n`,
      /unsupported wrapper test\.describe\.serial/,
    ],
    'test.only': ['unsupported', spec("  test.only('one', async () => {});"), /wrapper test\.only/],
    'test.skip': ['unsupported', spec("  test.skip('one', async () => {});"), /wrapper test\.skip/],
    'test.fixme': [
      'unsupported',
      spec("  test.fixme('one', async () => {});"),
      /wrapper test\.fixme/,
    ],
    'beforeEach hook': [
      'unsupported',
      spec(`  test.beforeEach(async () => {});\n${ONE_TEST}`),
      /wrapper test\.beforeEach/,
    ],
    'test options argument': [
      'unsupported',
      spec("  test('one', { timeout: 1000 }, async () => {});"),
      /test options argument/,
    ],
    'test tag without @': [
      'unsupported',
      spec("  test('one', { tag: 'smoke' }, async () => {});"),
      /test options argument/,
    ],
    'test tag details with another option': [
      'unsupported',
      spec("  test('one', { tag: '@x', timeout: 1000 }, async () => {});"),
      /test options argument/,
    ],
    'describe options argument': [
      'unsupported',
      `${HEADER}test.describe('d (dev only)', { timeout: 1000 }, () => {\n  runIfEnv(test, ['dev']);\n${ONE_TEST}\n});\n`,
      /test\.describe\(\.\.\.\) needs a title/,
    ],
    'test.extend fixture': [
      'unsupported',
      `${HEADER}const it = test.extend({});\n${spec(ONE_TEST).slice(HEADER.length)}`,
      /wrapper test\.extend/,
    ],
    'renamed test import': [
      'unsupported',
      `import { test as base } from '@playwright/test';\n${spec(ONE_TEST).slice(HEADER.length)}`,
      /renamed test import/,
    ],
    'test from another support module': [
      'unsupported',
      `import { test } from './support/other';\n${spec(ONE_TEST).slice(HEADER.length)}`,
      /test imported from somewhere other than @playwright\/test or tests\/support\/api\.ts/,
    ],
    'test from a look-alike api module in another folder': [
      'unsupported',
      `import { test } from './blog/support/api';\n${spec(ONE_TEST).slice(HEADER.length)}`,
      /test imported from somewhere other than @playwright\/test or tests\/support\/api\.ts/,
    ],
    'test used as a value': [
      'unsupported',
      `${HEADER}const alias = test;\n${spec(ONE_TEST).slice(HEADER.length)}`,
      /test used as a value/,
    ],
    'tests in a loop': [
      'unsupported',
      spec("  for (const n of ['a']) {\n    test('one', async () => {});\n  }"),
      /ForOfStatement inside test\.describe/,
    ],
    'test in a condition': [
      'unsupported',
      spec("  if (process.env.X) {\n    test('one', async () => {});\n  }"),
      /IfStatement inside test\.describe/,
    ],
    'test outside a describe': [
      'unsupported',
      `${HEADER}test('one', async () => {});\n`,
      /test\(\.\.\.\) outside test\.describe/,
    ],
    'nested describe': [
      'unsupported',
      spec(`  test.describe('inner', () => {\n${ONE_TEST}\n  });`),
      /nested or not a top-level/,
    ],
    'test inside a test body': [
      'unsupported',
      spec("  test('one', async () => {\n    test('two', async () => {});\n  });"),
      /test\(\.\.\.\) outside test\.describe, or inside a loop, condition or test body/,
    ],
    'missing runIfEnv': [
      'invalid',
      `${HEADER}test.describe('d', () => {\n${ONE_TEST}\n});\n`,
      /first statement of test\.describe must be runIfEnv/,
    ],
    'runIfEnv allowing prod': [
      'invalid',
      `${HEADER}test.describe('d', () => {\n  runIfEnv(test, ['dev', 'prod']);\n${ONE_TEST}\n});\n`,
      /must be runIfEnv\(test, \['dev'\]\)/,
    ],
    'template title with a substitution': [
      'dynamic-title',
      spec('  test(`one ${1}`, async () => {});'),
      /test title is not a literal \(template literal with \$\{…\}\)/,
    ],
    'concatenated title': [
      'dynamic-title',
      spec("  test('a' + 'b', async () => {});"),
      /\(concatenation\)/,
    ],
    'identifier title': [
      'dynamic-title',
      spec('  test(NAME, async () => {});'),
      /\(identifier NAME\)/,
    ],
    'function-call title': [
      'dynamic-title',
      spec("  test(String('x'), async () => {});"),
      /\(function call\)/,
    ],
    'dynamic describe title': [
      'dynamic-title',
      `${HEADER}test.describe(\`d \${1}\`, () => {\n  runIfEnv(test, ['dev']);\n${ONE_TEST}\n});\n`,
      /describe title is not a literal/,
    ],
    'duplicate test title': ['invalid', spec(`${ONE_TEST}\n${ONE_TEST}`), /duplicate test title/],
    'empty title': ['invalid', spec("  test('', async () => {});"), /empty test title/],
    'line break in a title': [
      'unsupported',
      spec("  test('a\\nb', async () => {});"),
      /line break or control character in the test title/,
    ],
    'describe without tests': [
      'invalid',
      `${HEADER}test.describe('d', () => {\n  runIfEnv(test, ['dev']);\n});\n`,
      /contains no supported tests/,
    ],
    'no tests at all': ['invalid', HEADER, /no tests found/],
    'parse error': [
      'parse-error',
      `${HEADER}test.describe('d', () => {\n  runIfEnv(test, ['dev']);\n`,
      /^vault-sync: parse-error tests\/x\.spec\.ts: \d+:\d+ parse-error: /m,
    ],
  };

  for (const [name, [status, source, detail]] of Object.entries(cases)) {
    test(`${name} -> ${status}`, () => {
      const root = makeFixture([]);
      put(root, 'tests/x.spec.ts', source);
      const result = write(root);
      assert.equal(result.status, 1, `${name}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, new RegExp(`^vault-sync: ${status} tests/x\\.spec\\.ts: `, 'm'));
      assert.match(result.stderr, detail);
      assert.match(result.stdout, /nothing written/);
      assert.equal(existsSync(join(root, 'vault')), false, 'no note was created');
      assert.equal(check(root).status, 1);
    });
  }

  test('invalid UTF-8 in a spec -> invalid', () => {
    const root = makeFixture([]);
    put(root, 'tests/x.spec.ts', Buffer.from([0x74, 0x65, 0xff, 0x0a]));
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /invalid tests\/x\.spec\.ts: tests\/x\.spec\.ts is not valid UTF-8/,
    );
    assert.equal(existsSync(join(root, 'vault')), false);
  });

  test('an existing note stays byte-for-byte when its spec becomes unsupported', () => {
    const root = makeFixture([HOME]);
    assert.equal(write(root).status, 0);
    const before = read(root, HOME_NOTE);
    writeFileSync(join(root, HOME), readText(root, HOME).replace('test(', 'test.only('));
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /unsupported tests\/blog\/home\.smoke\.spec\.ts: .*wrapper test\.only/,
    );
    assert.deepEqual(read(root, HOME_NOTE), before);
  });

  test('one failing spec stops the whole --write: the other stale note is not written either', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    const before = tree(root);
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// change\n`);
    put(root, 'tests/x.spec.ts', HEADER);
    const result = write(root);
    assert.equal(result.status, 1);
    const afterTree = tree(root);
    for (const rel of Object.keys(before).filter((rel) => rel.startsWith('vault/'))) {
      assert.deepEqual(afterTree[rel], before[rel], rel);
    }
  });

  test('the spec is parsed, never executed', () => {
    const root = makeFixture([]);
    const sentinel = join(root, 'EXECUTED');
    put(
      root,
      'tests/x.spec.ts',
      spec(
        "  test('one', async () => {\n" +
          `    require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'ran');\n` +
          '    process.exit(7);\n  });',
      ),
    );
    const result = write(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(sentinel), false);
    assert.ok(readText(root, 'vault/tests/x.md').includes('    - `one`'));
  });
});

describe('test from the Blog API fixture module (Week 3 Task 05, D1)', () => {
  const API_SPEC = 'tests/blog/api/x.spec.ts';
  const apiSpec = (from) =>
    `import { expect } from '@playwright/test';\nimport { runIfEnv } from '../../../env/runIfEnv';\n` +
    `import { test } from '${from}';\n\n` +
    "test.describe('fixture api (dev only)', () => {\n  runIfEnv(test, ['dev']);\n" +
    "  test('TC-API-999 one', async ({ guestApi }) => {\n    expect(guestApi).toBeDefined();\n  });\n});\n";

  for (const from of ['../../support/api', '../../support/api.ts']) {
    test(`a spec importing test from ${from} gets a note with its titles`, () => {
      const root = makeFixture([]);
      put(root, API_SPEC, apiSpec(from));
      const result = write(root);
      assert.equal(result.status, 0, result.stderr);
      const note = readText(root, 'vault/tests/blog/api/x.md');
      assert.ok(note.includes('fixture api (dev only)'), note);
      assert.ok(note.includes('    - `TC-API-999 one`'), note);
      assert.ok(note.includes('- **Page Object imports:** none'), note);
      assert.equal(check(root).status, 0);
    });
  }

  test('the same module name under another folder is still refused', () => {
    const root = makeFixture([]);
    put(root, API_SPEC, apiSpec('../support/api'));
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^vault-sync: unsupported tests\/blog\/api\/x\.spec\.ts: /m);
    assert.equal(existsSync(join(root, 'vault')), false, 'no note was created');
  });
});

describe('test from the optional database fixture module (Week 3 Task 09)', () => {
  const DB_SPEC = 'tests/db/x.spec.ts';
  const dbSpec = (from) =>
    `import { expect } from '@playwright/test';\nimport { runIfEnv } from '../../env/runIfEnv';\n` +
    `import { dbCount, test } from '${from}';\n\n` +
    "test.describe('fixture db (dev only)', () => {\n  runIfEnv(test, ['dev']);\n" +
    "  test('TC-DB-999 one', async () => {\n    const info = test.info();\n" +
    "    info.annotations.push({ type: 'drift', description: 'x' });\n" +
    "    expect(await dbCount('users')).toBeGreaterThanOrEqual(0);\n  });\n});\n";

  for (const from of ['../support/db', '../support/db.ts']) {
    test(`a spec importing test from ${from} gets a note with its titles`, () => {
      const root = makeFixture([]);
      put(root, DB_SPEC, dbSpec(from));
      const result = write(root);
      assert.equal(result.status, 0, result.stderr);
      const note = readText(root, 'vault/tests/db/x.md');
      assert.ok(note.includes('fixture db (dev only)'), note);
      assert.ok(note.includes('    - `TC-DB-999 one`'), note);
      assert.ok(note.includes('- **Page Object imports:** none'), note);
      assert.equal(check(root).status, 0);
    });
  }

  test('the same module name under another folder is still refused', () => {
    const root = makeFixture([]);
    put(root, DB_SPEC, dbSpec('./support/db'));
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^vault-sync: unsupported tests\/db\/x\.spec\.ts: /m);
    assert.match(result.stderr, /test imported from somewhere other than/);
    assert.equal(existsSync(join(root, 'vault')), false, 'no note was created');
  });

  test('a chained call on test.info() is still refused', () => {
    const root = makeFixture([]);
    const chained = dbSpec('../support/db').replace(
      "const info = test.info();\n    info.annotations.push({ type: 'drift', description: 'x' });",
      "test.info().annotations.push({ type: 'drift', description: 'x' });",
    );
    put(root, DB_SPEC, chained);
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /unsupported wrapper/);
  });
});

describe('test from the Store API fixture module (Week 4 Task 01)', () => {
  const STORE_SPEC = 'tests/store/api/x.spec.ts';
  const storeSpec = (from) =>
    `import { expect } from '@playwright/test';\nimport { runIfEnv } from '../../../env/runIfEnv';\n` +
    `import { requirePicked, test } from '${from}';\n\n` +
    "test.describe('fixture store (dev only)', () => {\n  runIfEnv(test, ['dev']);\n" +
    "  test('TC-SAPI-999 one', async ({ ownedCart }) => {\n    const info = test.info();\n" +
    '    requirePicked(info, [], 1);\n    expect(ownedCart).toBeDefined();\n  });\n});\n';

  for (const from of ['../../support/store', '../../support/store.ts']) {
    test(`a spec importing test from ${from} gets a note with its titles`, () => {
      const root = makeFixture([]);
      put(root, STORE_SPEC, storeSpec(from));
      const result = write(root);
      assert.equal(result.status, 0, result.stderr);
      const note = readText(root, 'vault/tests/store/api/x.md');
      assert.ok(note.includes('fixture store (dev only)'), note);
      assert.ok(note.includes('    - `TC-SAPI-999 one`'), note);
      assert.ok(note.includes('- **Page Object imports:** none'), note);
      assert.equal(check(root).status, 0);
    });
  }

  test('the same module name under another folder is still refused', () => {
    const root = makeFixture([]);
    put(root, STORE_SPEC, storeSpec('../support/store'));
    const result = write(root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /^vault-sync: unsupported tests\/store\/api\/x\.spec\.ts: /m);
    assert.match(result.stderr, /test imported from somewhere other than/);
    assert.equal(existsSync(join(root, 'vault')), false, 'no note was created');
  });
});

describe('suite tags in the details argument (Week 5 Task 01)', () => {
  const tagged =
    `${HEADER}test.describe('fixture (dev only)', { tag: '@regression' }, () => {\n  runIfEnv(test, ['dev']);\n` +
    "  test('one', { tag: '@smoke' }, async ({ page }) => {\n    await expect(page).toHaveURL(/x/);\n  });\n" +
    "  test('two', { tag: ['@e2e', '@smoke'] }, async ({ page }) => {\n    await expect(page).toHaveURL(/x/);\n  });\n});\n";

  test('a tagged describe and tests give a note with the same titles, and --check is clean', () => {
    const root = makeFixture([]);
    put(root, 'tests/x.spec.ts', tagged);
    const result = write(root);
    assert.equal(result.status, 0, result.stderr);
    const note = readText(root, 'vault/tests/x.md');
    assert.ok(note.includes('fixture (dev only)'), note);
    assert.ok(note.includes('    - `one`') && note.includes('    - `two`'), note);
    assert.equal(check(root).status, 0);
  });

  test('tags do not change the note: it equals the note of the untagged spec', () => {
    const plain = makeFixture([]);
    put(
      plain,
      'tests/x.spec.ts',
      tagged
        .replace(/, \{ tag: '@regression' \}/, '')
        .replace(/, \{ tag: (\[[^\]]*\]|'[^']*') \}/g, ''),
    );
    assert.equal(write(plain).status, 0);
    const withTags = makeFixture([]);
    put(withTags, 'tests/x.spec.ts', tagged);
    assert.equal(write(withTags).status, 0);
    const lines = (root) =>
      readText(root, 'vault/tests/x.md')
        .split(/\r?\n/)
        .filter((l) => l.startsWith('    - '));
    assert.deepEqual(lines(withTags), lines(plain));
  });
});

describe('deleted and renamed sources need reviewed recovery', () => {
  test('deleted spec: reported until the note is archived; then a clean deletion', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    const note = read(root, HOME_NOTE);
    rmSync(join(root, HOME));

    const checked = check(root);
    assert.equal(checked.status, 1);
    assert.match(
      checked.stderr,
      /^vault-sync: source-missing vault\/tests\/blog\/home\.smoke\.md: tests\/blog\/home\.smoke\.spec\.ts no longer exists; review .* archive it outside vault\/tests\/ \(the generator never deletes notes\)$/m,
    );
    for (const args of [[], [HOME]]) {
      const result = write(root, ...args);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /nothing written/);
      assert.deepEqual(read(root, HOME_NOTE), note, 'the note is never deleted or rewritten');
    }

    // Reviewed recovery: a person archives the note outside vault/tests/.
    mkdirSync(join(root, 'vault/_raw/archived-tests'), { recursive: true });
    renameSync(join(root, HOME_NOTE), join(root, 'vault/_raw/archived-tests/home.smoke.md'));
    assert.equal(check(root).status, 0);
    const selected = check(root, HOME);
    assert.equal(selected.status, 0, selected.stderr);
    assert.match(selected.stdout, /1 spec path\(s\), 0 fresh, 1 deleted with no note, 0 failed/);
    assert.equal(write(root, HOME).status, 0);
  });

  test('renamed spec: new note missing and old note source-less; both paths are reported', () => {
    const root = makeFixture();
    assert.equal(write(root).status, 0);
    const renamed = 'tests/blog/home-page.smoke.spec.ts';
    renameSync(join(root, HOME), join(root, renamed));

    const checked = check(root);
    assert.equal(checked.status, 1);
    assert.match(checked.stderr, /^vault-sync: missing vault\/tests\/blog\/home-page\.smoke\.md$/m);
    assert.match(
      checked.stderr,
      /^vault-sync: source-missing vault\/tests\/blog\/home\.smoke\.md: /m,
    );
    assert.equal(write(root).status, 1);
    assert.equal(existsSync(join(root, 'vault/tests/blog/home-page.smoke.md')), false);

    const selected = write(root, renamed);
    assert.equal(selected.status, 0, selected.stderr);
    assert.ok(existsSync(join(root, 'vault/tests/blog/home-page.smoke.md')));
    assert.equal(check(root, HOME, renamed).status, 1, 'old note still needs review');

    mkdirSync(join(root, 'vault/_raw/archived-tests'), { recursive: true });
    renameSync(join(root, HOME_NOTE), join(root, 'vault/_raw/archived-tests/home.smoke.md'));
    assert.equal(check(root, HOME, renamed).status, 0);
    assert.equal(check(root).status, 0);
  });
});

describe('arguments and paths', () => {
  const usageCases = {
    'no arguments': [],
    'unknown mode': ['--bogus'],
    'two modes': ['--write', '--check'],
    'mode given twice': ['--write', '--write'],
    '--stage with --check': ['--check', '--stage', '--files', HOME],
    '--stage without --files': ['--write', '--stage'],
    'flag after --files': ['--write', '--files', HOME, '--stage'],
    '--files twice': ['--check', '--files', HOME, '--files', HOME],
    '--files without paths': ['--check', '--files'],
    '--files without a mode': ['--files', HOME],
    'logging mode with an extra argument': ['--session-start', '--write'],
    'from-hook with an extra argument': ['--from-hook', '--check'],
  };
  for (const [name, args] of Object.entries(usageCases)) {
    test(`${name} -> usage, exit 2, nothing written`, () => {
      const root = makeFixture([HOME]);
      const before = tree(root);
      const result = run(root, args, { input: '{}' });
      assert.equal(result.status, 2, name);
      assert.match(result.stderr, /^usage: |\nusage: /);
      assert.deepEqual(tree(root), before);
    });
  }

  test('unsafe or outside-tests paths -> exit 2, nothing written', () => {
    const root = makeFixture([HOME]);
    const elsewhere = makeTemp('vault-sync-elsewhere-');
    const before = tree(root);
    for (const bad of [
      '../x.spec.ts',
      join(elsewhere, 'tests', 'x.spec.ts'),
      'vault/tests/x.spec.ts',
      'tests/support/users.ts',
      'tests/a.ts',
      'tests/.spec.ts',
      'tests/../tests/blog/home.smoke.spec.ts',
      'tests//blog/home.smoke.spec.ts',
      'Tests/blog/home.smoke.spec.ts',
      'tests/a\u0007.spec.ts',
      'pages/BlogListPage.ts',
    ]) {
      const result = check(root, bad);
      assert.equal(result.status, 2, bad);
      assert.equal(write(root, bad).status, 2, bad);
    }
    assert.equal(check(root, 'tests/a.spec.ts', 'tests/A.spec.ts').status, 2, 'case-only twins');
    assert.deepEqual(tree(root), before);
  });

  test('an absolute path inside the fixture and a backslash path are accepted', () => {
    const root = makeFixture([HOME]);
    assert.equal(write(root, join(root, 'tests', 'blog', 'home.smoke.spec.ts')).status, 0);
    assert.equal(check(root, 'tests\\blog\\home.smoke.spec.ts').status, 0);
  });

  test('letter case that differs from the file on disk is refused (Windows)', (t) => {
    if (process.platform !== 'win32') return t.skip('case-insensitive file system only');
    const root = makeFixture([HOME]);
    const result = write(root, 'tests/blog/HOME.smoke.spec.ts');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /letter case differs from the file on disk/);
    assert.equal(existsSync(join(root, 'vault')), false);
  });

  test('a symbolic link on the way to a spec is refused', (t) => {
    const root = makeFixture([]);
    const target = makeTemp('vault-sync-link-target-');
    writeFileSync(join(target, 'x.spec.ts'), spec(ONE_TEST));
    mkdirSync(join(root, 'tests'));
    try {
      symlinkSync(target, join(root, 'tests', 'linked'), 'junction');
    } catch {
      return t.skip('cannot create a link here');
    }
    const result = write(root, 'tests/linked/x.spec.ts');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /symbolic link in the path/);
    assert.equal(existsSync(join(root, 'vault')), false);
  });
});

describe('earlier modes are unchanged; --from-hook also refreshes the note (stage 2)', () => {
  const hookEvent = (root, rel) =>
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(root, rel) } });

  test('--from-hook on a spec records one change-log entry and refreshes the note quietly', () => {
    const root = makeFixture([HOME]);
    const result = run(root, ['--from-hook'], { input: hookEvent(root, HOME) });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const logs = readdirSync(join(root, 'vault/_changelog'));
    assert.equal(logs.length, 1);
    assert.match(
      readText(root, `vault/_changelog/${logs[0]}`),
      /\*\*what:\*\* tests\/blog\/home\.smoke\.spec\.ts · /,
    );
    assert.ok(existsSync(join(root, HOME_NOTE)), 'note created');
    assert.equal(check(root).status, 0, 'and fresh');

    writeFileSync(join(root, HOME), `${readText(root, HOME)}// edited\n`);
    const before = readText(root, HOME_NOTE);
    assert.equal(run(root, ['--from-hook'], { input: hookEvent(root, HOME) }).status, 0);
    assert.notEqual(readText(root, HOME_NOTE), before, 'block refreshed');
    assert.equal(check(root).status, 0);
  });

  test('--from-hook never stages the refreshed note', () => {
    const root = makeFixture([HOME]);
    const gitEnv = isolatedEnv(root);
    const g = (...args) => spawnSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8' });
    g('init', '-q');
    assert.equal(run(root, ['--from-hook'], { input: hookEvent(root, HOME) }).status, 0);
    assert.ok(existsSync(join(root, HOME_NOTE)));
    assert.equal(g('diff', '--cached', '--name-only').stdout, '');
    assert.equal(g('ls-files').stdout, '', 'nothing added to the index');
  });

  test('--from-hook on an unsupported spec: entry recorded, one stderr line, exit 0, no note', () => {
    const root = makeFixture([]);
    put(root, 'tests/x.spec.ts', `${HEADER}test('outside', async () => {});\n`);
    const result = run(root, ['--from-hook'], { input: hookEvent(root, 'tests/x.spec.ts') });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(
      result.stderr,
      'vault-sync: note not refreshed: unsupported tests/x.spec.ts; run npm run vault:check for details\n',
    );
    assert.equal(readdirSync(join(root, 'vault/_changelog')).length, 1);
    assert.equal(existsSync(join(root, 'vault/tests')), false);
  });

  test('--from-hook on a damaged note leaves it byte-for-byte and says so in one line', () => {
    const root = makeFixture([HOME]);
    assert.equal(write(root).status, 0);
    put(root, HOME_NOTE, readText(root, HOME_NOTE).replace(`${END}\n`, ''));
    writeFileSync(join(root, HOME), `${readText(root, HOME)}// edited\n`);
    const before = read(root, HOME_NOTE);
    const result = run(root, ['--from-hook'], { input: hookEvent(root, HOME) });
    assert.equal(result.status, 0);
    assert.match(
      result.stderr,
      /^vault-sync: note not refreshed: invalid vault\/tests\/blog\/home\.smoke\.md; /,
    );
    assert.deepEqual(read(root, HOME_NOTE), before);
  });

  test('--from-hook on a non-spec test file or a vault note writes no note', () => {
    const root = makeFixture([HOME]);
    put(root, 'tests/support/helper.ts', 'export const x = 1;\n');
    for (const rel of [
      'tests/support/helper.ts',
      'vault/tests/blog/home.smoke.md',
      'pages/BasePage.ts',
    ]) {
      const result = run(root, ['--from-hook'], { input: hookEvent(root, rel) });
      assert.equal(result.status, 0, rel);
      assert.equal(result.stderr, '', rel);
    }
    assert.equal(existsSync(join(root, 'vault/tests')), false);
  });

  test('--from-hook on a deleted spec records the entry and stays silent', () => {
    const root = makeFixture([]);
    const result = run(root, ['--from-hook'], { input: hookEvent(root, 'tests/gone.spec.ts') });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(existsSync(join(root, 'vault/tests')), false);
  });

  test('--session-start and --session-end write their line and no note', () => {
    const root = makeFixture([HOME]);
    for (const mode of ['--session-start', '--session-end']) {
      const result = run(root, [mode], { input: '{}' });
      assert.equal(result.status, 0, mode);
      assert.equal(result.stdout, '', mode);
    }
    assert.match(
      readText(root, 'vault/_changelog/sessions.log'),
      /^- session START .*\n- session END /,
    );
    assert.equal(existsSync(join(root, 'vault/tests')), false);
  });

  test('a path given to a logging mode never reaches the generator', () => {
    const root = makeFixture([HOME]);
    const result = run(root, ['--session-end'], { input: JSON.stringify({ file_path: HOME }) });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(root, 'vault/tests')), false);
  });
});

describe('formatting scope', () => {
  test('.prettierignore keeps Prettier away from managed notes', () => {
    const lines = readFileSync(join(PROJECT, '.prettierignore'), 'utf8').split(/\r?\n/);
    assert.ok(lines.includes('vault/tests/'), 'vault/tests/ is listed');
  });
});

describe('--stage needs a Git work tree (stage 2)', () => {
  test('outside a repository: refused before anything is written', () => {
    const root = makeFixture([HOME]);
    const before = tree(root);
    const result = run(root, ['--write', '--stage', '--files', HOME]);
    assert.equal(result.status, 1);
    assertRoot(result, root);
    assert.match(result.stderr, /^vault-sync: refused git rev-parse failed/m);
    assert.match(result.stdout, /nothing written or staged/);
    assert.deepEqual(tree(root), before);
  });
});

// ---------------------------------------------------------------------------------------------
// scripts/vault-links.mjs (npm run vault:validate)

function links(root, args = []) {
  const result = spawnSync(process.execPath, [LINKS, ...args], {
    cwd: CWD,
    env: isolatedEnv(root),
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A fixture with a map that links every given maintained note, plus the given extra files. */
function linkFixture(files) {
  const root = makeTemp('vault-links-root-');
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  return root;
}

describe('vault-links: broken and working links', () => {
  test('a broken local link fails; after the repair it passes', () => {
    const root = linkFixture({
      'vault/_map.md': '# Map\n\n- [guide](guide.md)\n',
      'vault/guide.md': '# Guide\n\nSee [the spec](../tests/a.spec.ts).\n',
    });
    const broken = links(root);
    assert.equal(broken.status, 1);
    assert.equal(broken.stdout.split('\n')[0], `vault-links: root ${root}`);
    assert.match(
      broken.stdout,
      /^vault-links: broken vault\/guide\.md:3: \.\.\/tests\/a\.spec\.ts \(target does not exist\)$/m,
    );
    put(root, 'tests/a.spec.ts', '// spec\n');
    const repaired = links(root);
    assert.equal(repaired.status, 0, repaired.stdout);
    assert.match(repaired.stdout, /0 broken, 0 warning\(s\)$/m);
  });

  test('labels, angle brackets, titles, optional .md, fragments, references and wikilinks', () => {
    const root = linkFixture({
      'vault/_map.md': [
        '# Map',
        '',
        '- [Guide **bold** label](guide.md#a-heading "title")',
        '- [no extension](guide)',
        '- [spaces](<sub folder/a note.md>)',
        '- [encoded](sub%20folder/a%20note.md?x=1)',
        '- [ref link][r]',
        '- [[guide]] and [[guide|Guide label]] and [[sub folder/a note#Part]] and [[guide.md]]',
        '- [folder](sub%20folder/)',
        '',
        '[r]: guide.md',
        '',
      ].join('\n'),
      'vault/guide.md': '# Guide\n',
      'vault/sub folder/a note.md': '# Note\n',
    });
    const result = links(root);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /3 note\(s\), 10 link\(s\) checked, 0 broken, 0 warning\(s\)$/m);
  });

  test('each kind of broken target is an error', () => {
    const root = linkFixture({
      'vault/_map.md': [
        '[missing](nope.md)',
        '[[nope]]',
        '[[../outside]]',
        '[escape](../../outside.md)',
        '[bad](%E0%A4%A.md)',
        '[ref][r]',
        '',
        '[r]: missing-ref.md',
        '',
      ].join('\n'),
    });
    const result = links(root);
    assert.equal(result.status, 1);
    for (const reason of [
      'nope.md (target does not exist)',
      'nope (target does not exist)',
      '../outside (wikilink outside the vault)',
      '../../outside.md (outside the project)',
      '%E0%A4%A.md (malformed percent-encoding)',
      'missing-ref.md (target does not exist)',
    ]) {
      assert.ok(result.stdout.includes(reason), reason);
    }
    assert.match(result.stdout, /6 broken/);
  });
});

describe('vault-links: what is ignored', () => {
  test('code examples (fenced and inline), images, web and mail links, same-note anchors', () => {
    const root = linkFixture({
      'vault/_map.md': [
        '# Map',
        '',
        'Inline `[not a link](missing-1.md)` and ``[[missing-2]] with ` inside``.',
        '',
        '```md',
        '[fenced](missing-3.md)',
        '[[missing-4]]',
        '```',
        '',
        '~~~~',
        '[tilde fenced](missing-5.md)',
        '```',
        '[still fenced](missing-6.md)',
        '~~~~',
        '',
        '![image](missing.png) ![[missing.png]]',
        '[web](https://example.invalid/x) [mail](mailto:someone@example.invalid) [anchor](#map)',
        '',
        '[real](guide.md)',
        '',
      ].join('\n'),
      'vault/guide.md': '# Guide\n',
    });
    const result = links(root);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /2 note\(s\), 1 link\(s\) checked, 0 broken, 0 warning\(s\)$/m);
  });

  test('the generated block of an archived note outside vault/tests/ is not checked', () => {
    const block =
      '<!-- generated:start -->\n- [gone](../../../tests/gone.spec.ts)\n<!-- generated:end -->';
    const root = linkFixture({
      'vault/_map.md': '# Map\n',
      'vault/_raw/archived-tests/gone.md': `# gone\n\n${block}\n\n[human link](../../../missing.md)\n`,
      'vault/tests/blog/live.md': `# live\n\n${block}\n`,
    });
    const result = links(root);
    assert.equal(result.status, 1);
    const brokenLines = result.stdout.split('\n').filter((line) => line.includes(' broken vault/'));
    assert.deepEqual(brokenLines, [
      'vault-links: broken vault/_raw/archived-tests/gone.md:7: ../../../missing.md (target does not exist)',
      'vault-links: broken vault/tests/blog/live.md:4: ../../../tests/gone.spec.ts (target does not exist)',
    ]);
  });
});

describe('vault-links: unlinked notes', () => {
  test('an unlinked maintained note is a warning only (exit 0)', () => {
    const root = linkFixture({
      'vault/_map.md': '# Map\n\n- [linked](linked.md)\n',
      'vault/linked.md': '# Linked\n',
      'vault/03-framework/lonely.md': '# Nobody links here\n',
    });
    const result = links(root);
    assert.equal(result.status, 0);
    assert.match(
      result.stdout,
      /^vault-links: warning vault\/03-framework\/lonely\.md: no other note links to it$/m,
    );
    assert.match(result.stdout, /0 broken, 1 warning\(s\)$/m);
  });

  test('a note that links only to itself still counts as unlinked', () => {
    const root = linkFixture({
      'vault/_map.md': '# Map\n',
      'vault/self.md': '# Self\n\n[me](self.md) [[self]]\n',
    });
    const result = links(root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /warning vault\/self\.md: no other note links to it/);
  });

  test('no warning for the map, raw notes, logs, imports and daily journals', () => {
    const root = linkFixture({
      'vault/_map.md': '# Map\n',
      'vault/_raw/capture.md': 'raw text\n',
      'vault/_changelog/2026-01-01.md': '# Change log 2026-01-01\n',
      'vault/sources/jira/key-map.md':
        '| key | summary |\n| --- | --- |\n| QA-1 | imported, no front matter |\n',
      'vault/12-progress-report/someone/2026-01-01.md': '# Worklog 2026-01-01\n',
    });
    const result = links(root);
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /5 note\(s\), 0 link\(s\) checked, 0 broken, 0 warning\(s\)$/m);
  });

  test('extra arguments print usage and exit 2', () => {
    const root = linkFixture({ 'vault/_map.md': '# Map\n' });
    const result = links(root, ['--fix']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^usage: /);
  });
});

describe('vault-links: guides under 03-framework/ need an H1 (warning only)', () => {
  const MAP = '# Map\n\n- [guide](03-framework/guide.md)\n';
  const HEADLESS = [
    '---',
    'id: guide',
    '# not a heading: YAML comment in front matter',
    '---',
    '',
    '```md',
    '# Example inside fenced code',
    '```',
    '',
    '    # indented four spaces, so code',
    '',
    '#NoSpace is not a heading',
    '',
    '#',
    '',
    '## Section',
    '',
    'Text.',
    '',
  ].join('\n');
  const H1_WARNING =
    'vault-links: warning vault/03-framework/guide.md: no H1 heading outside code (a guide starts with "# Title")';

  test('warning fixture: no H1 outside code -> one warning, exit 0', () => {
    const root = linkFixture({ 'vault/_map.md': MAP, 'vault/03-framework/guide.md': HEADLESS });
    const result = links(root);
    assert.equal(result.status, 0, 'a warning alone never fails');
    assert.deepEqual(
      result.stdout.split('\n').filter((line) => line.includes(' warning ')),
      [H1_WARNING],
    );
    assert.match(result.stdout, /0 broken, 1 warning\(s\)$/m);
  });

  test('repaired fixture: "# Guide title" added -> no warning, exit 0', () => {
    const repaired = HEADLESS.replace('---\n\n```md', '---\n\n# Guide title\n\n```md');
    assert.notEqual(repaired, HEADLESS);
    const root = linkFixture({ 'vault/_map.md': MAP, 'vault/03-framework/guide.md': repaired });
    const result = links(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes('no H1 heading'), false);
    assert.match(result.stdout, /0 broken, 0 warning\(s\)$/m);
  });

  test('accepted H1 forms: setext, up to three spaces, closing hashes, code span title, CRLF', () => {
    const variants = {
      'setext.md': 'Guide title\n===========\n\nText.\n',
      'indented.md': '   # Indented three spaces\n',
      'closed.md': '# Closed title #\n',
      'code-title.md': '# `vault-sync` modes\n',
      'crlf.md': '---\r\nid: x\r\n---\r\n\r\n# Title\r\n',
      'nested/deeper.md': '# Deeper guide\n',
    };
    const files = {
      'vault/_map.md': `# Map\n\n${Object.keys(variants)
        .map((name) => `- [${name}](03-framework/${name})`)
        .join('\n')}\n`,
    };
    for (const [name, content] of Object.entries(variants)) {
      files[`vault/03-framework/${name}`] = content;
    }
    const result = links(linkFixture(files));
    assert.equal(result.status, 0, result.stdout);
    assert.equal(result.stdout.includes('no H1 heading'), false, result.stdout);
  });

  test('outside 03-framework/ a missing H1 is never reported', () => {
    const files = { 'vault/_map.md': '# Map\n', 'vault/_context.md': '## No title\n' };
    for (const rel of [
      'vault/_raw/capture.md',
      'vault/sources/jira/key-map.md',
      'vault/_changelog/2026-01-01.md',
      'vault/12-progress-report/someone/2026-01-01.md',
      'vault/tests/blog/x.md',
      'vault/other.md',
    ]) {
      files[rel] = '## Only a section\n';
    }
    const result = links(linkFixture(files));
    assert.equal(result.status, 0);
    assert.equal(result.stdout.includes('no H1 heading'), false, result.stdout);
  });

  test('a broken link still fails with the H1 warning present (exit from the link, not the warning)', () => {
    const root = linkFixture({
      'vault/_map.md': `${MAP}- [missing](missing.md)\n`,
      'vault/03-framework/guide.md': HEADLESS,
    });
    const result = links(root);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes(H1_WARNING));
    assert.match(result.stdout, /1 broken, 1 warning\(s\)$/m);
  });
});
