// Isolated checks for scripts/agent-quality/bundle.mjs (Week 4 Task 03, rule 60).
// node:test, no browser, no network. Each case copies the real script into its own temporary
// project (the script reads only its own project root) and builds the fixture there, so the real
// evidence/agent-quality/ folder is never read or changed.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/agent-quality/bundle.mjs', import.meta.url));
const FIXTURES = 'evidence/agent-quality/fixtures';
const temps = [];

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

const goodManifest = (caseId = 'case-01') => ({
  caseId,
  inputKind: 'synthetic',
  sourceVersion: 'v1',
  sourceDate: '2026-11-08',
  requirementPath: 'requirement.md',
  evidencePaths: ['run-summary.json'],
  missingObservations: [],
});

/** A temporary project with the script and one case folder; returns its root. */
function project({ manifest = goodManifest(), files, caseId = 'case-01', raw } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aq-bundle-'));
  temps.push(root);
  mkdirSync(join(root, 'scripts/agent-quality'), { recursive: true });
  copyFileSync(SCRIPT, join(root, 'scripts/agent-quality/bundle.mjs'));
  const dir = join(root, FIXTURES, caseId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'case.json'), raw ?? JSON.stringify(manifest, null, 2));
  const content = files ?? {
    'requirement.md': '# Requirement\n\nSynthetic practice input.\n',
    'run-summary.json': '{ "synthetic": true }\n',
  };
  for (const [name, text] of Object.entries(content)) writeFileSync(join(dir, name), text);
  // Added 2026-11-08: review mode adds the case's checklist row, so every project has a small
  // rubric and map (self-heal mode must never read them).
  writeFileSync(
    join(root, 'evidence/agent-quality/rubric.md'),
    '| Practice case | Supplied review checklist |\n| --- | --- |\n' +
      '| Alpha | ALPHA-ROW-TEXT |\n| Beta | BETA-ROW-TEXT |\n',
  );
  writeFileSync(
    join(root, 'evidence/agent-quality/rubric-map.json'),
    JSON.stringify({ 'case-01': 'Alpha', 'case-02': 'Beta' }),
  );
  return root;
}

function run(root, ...args) {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/agent-quality/bundle.mjs'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const selfHeal = (root, caseId = 'case-01') => run(root, '--self-heal', `${FIXTURES}/${caseId}`);

function assertInputError(result, code) {
  assert.equal(result.status, 0);
  assert.match(result.out, new RegExp(`^BUNDLE-STATUS: input-error ${code}\\nINPUT ERROR: `));
  assert.doesNotMatch(result.out, /=== FILE/);
}

describe('valid bundles', () => {
  test('a valid bundle prints the header, each listed file and a stable hash', () => {
    const root = project();
    const first = selfHeal(root);
    assert.equal(first.status, 0);
    assert.match(first.out, /^BUNDLE-STATUS: ok\nmode: self-heal\ncaseId: case-01\n/);
    assert.match(first.out, /inputKind: synthetic\nsourceVersion: v1\nsourceDate: 2026-11-08\n/);
    assert.match(first.out, /=== FILE requirement requirement\.md sha256=[0-9a-f]{64}/);
    assert.match(first.out, /=== FILE evidence run-summary\.json sha256=[0-9a-f]{64}/);
    assert.match(first.out, /missingObservations: none declared/);
    assert.equal(selfHeal(root).out, first.out);
  });

  test('declared missing observations make a valid bundle, not an input error', () => {
    const manifest = { ...goodManifest(), missingObservations: ['page snapshot at the failure'] };
    const result = selfHeal(project({ manifest }));
    assert.match(result.out, /^BUNDLE-STATUS: ok/);
    assert.match(result.out, /missingObservations:\n- page snapshot at the failure\n/);
  });

  test('an unlisted file in the case folder is not included', () => {
    const files = {
      'requirement.md': 'Synthetic.\n',
      'run-summary.json': '{}\n',
      'notes.md': 'UNLISTED-CONTENT\n',
    };
    const result = selfHeal(project({ files }));
    assert.match(result.out, /^BUNDLE-STATUS: ok/);
    assert.doesNotMatch(result.out, /UNLISTED-CONTENT/);
  });

  test('a Windows-style argument with backslashes and a trailing slash is accepted', () => {
    const result = run(project(), '--self-heal', 'evidence\\agent-quality\\fixtures\\case-01\\');
    assert.match(result.out, /^BUNDLE-STATUS: ok/);
  });
});

describe('input errors', () => {
  test('a listed file that does not exist', () => {
    const manifest = { ...goodManifest(), evidencePaths: ['run-summary.json', 'trace.json'] };
    assertInputError(selfHeal(project({ manifest })), 'missing-file');
  });

  test('a case folder that does not exist', () => {
    assertInputError(selfHeal(project(), 'case-09'), 'missing-file');
  });

  test('a manifest that is not JSON', () => {
    assertInputError(selfHeal(project({ raw: '{ "caseId": ' })), 'malformed-manifest');
  });

  test('a manifest that is a list', () => {
    assertInputError(selfHeal(project({ raw: '[]' })), 'malformed-manifest');
  });

  for (const key of [
    'caseId',
    'inputKind',
    'sourceVersion',
    'sourceDate',
    'requirementPath',
    'evidencePaths',
    'missingObservations',
  ]) {
    test(`a missing required field: ${key}`, () => {
      const manifest = goodManifest();
      delete manifest[key];
      assertInputError(selfHeal(project({ manifest })), 'missing-field');
    });
  }

  for (const key of ['category', 'expected', 'rubricPath', 'relatedCase']) {
    test(`an extra field is refused: ${key}`, () => {
      const manifest = { ...goodManifest(), [key]: 'x' };
      assertInputError(selfHeal(project({ manifest })), 'unknown-field');
    });
  }

  for (const [label, patch] of [
    ['caseId not equal to the folder', { caseId: 'case-02' }],
    ['inputKind not synthetic', { inputKind: 'real' }],
    ['empty sourceVersion', { sourceVersion: ' ' }],
    ['impossible sourceDate', { sourceDate: '2026-02-30' }],
    ['empty evidencePaths', { evidencePaths: [] }],
    ['requirement listed as evidence', { evidencePaths: ['requirement.md'] }],
    ['missingObservations not a list', { missingObservations: 'none' }],
    ['missingObservations with an empty item', { missingObservations: [''] }],
  ]) {
    test(`a wrong field: ${label}`, () => {
      const manifest = { ...goodManifest(), ...patch };
      assertInputError(selfHeal(project({ manifest })), 'wrong-field');
    });
  }

  for (const path of [
    '../case-02/requirement.md',
    '/etc/hosts',
    'sub/requirement.md',
    'case.json',
    'notes.exe',
  ]) {
    test(`a path that is not a plain file name in the folder: ${path}`, () => {
      const manifest = { ...goodManifest(), evidencePaths: [path] };
      assertInputError(selfHeal(project({ manifest })), 'bad-path');
    });
  }

  test('a listed file that is a link', (t) => {
    const root = project();
    const dir = join(root, FIXTURES, 'case-01');
    writeFileSync(join(root, 'outside.txt'), 'outside\n');
    try {
      symlinkSync(join(root, 'outside.txt'), join(dir, 'linked.txt'));
    } catch {
      t.skip('this system does not allow creating a symbolic link');
      return;
    }
    const manifest = { ...goodManifest(), evidencePaths: ['linked.txt'] };
    writeFileSync(join(dir, 'case.json'), JSON.stringify(manifest));
    assertInputError(selfHeal(root), 'link-not-allowed');
  });

  test('a file over the size limit', () => {
    const files = { 'requirement.md': 'x'.repeat(64 * 1024 + 1), 'run-summary.json': '{}\n' };
    assertInputError(selfHeal(project({ files })), 'file-too-large');
  });

  test('secret-like text is refused and not echoed', () => {
    const marker = 'pass' + 'word=hunter2';
    const files = { 'requirement.md': `${marker}\n`, 'run-summary.json': '{}\n' };
    const result = selfHeal(project({ files }));
    assertInputError(result, 'secret-like-text');
    assert.doesNotMatch(result.out, /hunter2/);
  });

  test('an email address is refused', () => {
    const files = {
      'requirement.md': 'contact a.person@' + 'example.test\n',
      'run-summary.json': '{}\n',
    };
    assertInputError(selfHeal(project({ files })), 'secret-like-text');
  });

  for (const args of [
    [],
    ['--self-heal'],
    ['--self-heal', `${FIXTURES}/case-01`, '--extra'],
    ['--other', 'case-01'],
  ]) {
    test(`a usage error: ${JSON.stringify(args)}`, () => {
      assertInputError(run(project(), ...args), 'usage');
    });
  }

  for (const arg of ['evidence/raw/week4', `${FIXTURES}/../../week4-checks.md`, 'case-01']) {
    test(`a /self-heal argument outside the fixtures folder: ${arg}`, () => {
      assertInputError(run(project(), '--self-heal', arg), 'bad-argument');
    });
  }
});

describe('review mode', () => {
  test('no recorded reply is an input error', () => {
    assertInputError(run(project(), '--review', 'case-01'), 'no-answer-record');
  });

  test('a review argument must be a case id', () => {
    assertInputError(run(project(), '--review', `${FIXTURES}/case-01`), 'bad-argument');
  });

  // Changed 2026-11-08 (owner decision "(a)"): the review takes the FIRST recorded reply, the
  // original; it previously took the latest. Same three assertions, expectation reversed.
  test('the first recorded reply (the original) is included and named', () => {
    const root = project();
    const dir = join(root, 'evidence/agent-quality/answers/case-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'self-heal-20261109T100000Z.md'), 'OLDER-REPLY\n');
    writeFileSync(join(dir, 'self-heal-20261109T110000Z.md'), 'NEWER-REPLY\n');
    writeFileSync(join(dir, 'quality-review-20261109T120000Z.md'), 'REVIEW-REPLY\n');
    const result = run(root, '--review', 'case-01');
    assert.match(result.out, /^BUNDLE-STATUS: ok\nmode: review\n/);
    assert.match(
      result.out,
      /answerRecord: evidence\/agent-quality\/answers\/case-01\/self-heal-20261109T100000Z\.md/,
    );
    assert.match(result.out, /OLDER-REPLY/);
    assert.doesNotMatch(result.out, /NEWER-REPLY|REVIEW-REPLY/);
  });

  // Added 2026-11-08 (owner approval): the review header names the case bundle hash.
  test('the review header carries the case bundle hash and whether the record matches it', () => {
    const root = project();
    const caseSha = selfHeal(root).out.match(/^bundleSha256: ([0-9a-f]{64})$/m)[1];
    const dir = join(root, 'evidence/agent-quality/answers/case-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'self-heal-20261109T100000Z.md'),
      `- bundleSha256: ${caseSha}\nREPLY\n`,
    );
    const match = run(root, '--review', 'case-01').out;
    assert.match(match, new RegExp(`^caseBundleSha256: ${caseSha}$`, 'm'));
    assert.match(match, /^caseBundleMatchesRecord: yes$/m);
    assert.doesNotMatch(match, new RegExp(`^bundleSha256: ${caseSha}$`, 'm'));

    writeFileSync(
      join(dir, 'self-heal-20261109T100000Z.md'),
      `- bundleSha256: ${'0'.repeat(64)}\n`,
    );
    assert.match(run(root, '--review', 'case-01').out, /^caseBundleMatchesRecord: no$/m);

    writeFileSync(join(dir, 'self-heal-20261109T100000Z.md'), 'REPLY WITHOUT HEADER\n');
    assert.match(run(root, '--review', 'case-01').out, /^recordedBundleSha256: not recorded$/m);
  });
});

// Added 2026-11-08 (owner approval, course step): the reviewer gets its case's one checklist row,
// and a review may name which recorded reply it reviews.
describe('review checklist row and named record', () => {
  function withReplies(root, caseId = 'case-01') {
    const dir = join(root, 'evidence/agent-quality/answers', caseId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'self-heal-20261109T100000Z.md'), 'FIRST-REPLY\n');
    writeFileSync(join(dir, 'self-heal-20261109T110000Z.md'), 'SECOND-REPLY\n');
    return root;
  }

  test('a review includes only its own case row', () => {
    const out = run(withReplies(project()), '--review', 'case-01').out;
    assert.match(out, /^BUNDLE-STATUS: ok/);
    assert.match(out, /=== FILE rubric-row evidence\/agent-quality\/rubric\.md sha256=/);
    assert.match(out, /Practice case: Alpha\nSupplied review checklist: ALPHA-ROW-TEXT\n/);
    assert.doesNotMatch(out, /BETA-ROW-TEXT|Practice case: Beta/);
  });

  test('a /self-heal bundle never includes a checklist row', () => {
    const out = selfHeal(project()).out;
    assert.match(out, /^BUNDLE-STATUS: ok/);
    assert.doesNotMatch(out, /ALPHA-ROW-TEXT|BETA-ROW-TEXT|rubric/);
  });

  test('the review hash of the case bundle does not change with the checklist row', () => {
    const root = withReplies(project());
    const caseSha = selfHeal(root).out.match(/^bundleSha256: ([0-9a-f]{64})$/m)[1];
    assert.match(
      run(root, '--review', 'case-01').out,
      new RegExp(`^caseBundleSha256: ${caseSha}$`, 'm'),
    );
  });

  test('a named record is reviewed instead of the first one', () => {
    const out = run(withReplies(project()), '--review', 'case-01 self-heal-20261109T110000Z').out;
    assert.match(out, /answerRecord: .*self-heal-20261109T110000Z\.md/);
    assert.match(out, /SECOND-REPLY/);
    assert.doesNotMatch(out, /FIRST-REPLY/);
  });

  test('without a name the first record is still reviewed', () => {
    const out = run(withReplies(project()), '--review', 'case-01').out;
    assert.match(out, /FIRST-REPLY/);
    assert.doesNotMatch(out, /SECOND-REPLY/);
  });

  test('a named record that does not exist is an input error', () => {
    const result = run(withReplies(project()), '--review', 'case-01 self-heal-20261109T120000Z');
    assertInputError(result, 'no-answer-record');
  });

  for (const arg of ['case-01 notes', 'case-01 self-heal-x', 'case-01 a b', 'case-01 ../case-02']) {
    test(`a malformed review argument: ${arg}`, () => {
      assertInputError(run(withReplies(project()), '--review', arg), 'bad-argument');
    });
  }

  test('a case with no row in the map is an input error', () => {
    const root = project({ manifest: goodManifest('case-03'), caseId: 'case-03' });
    withReplies(root, 'case-03');
    assertInputError(run(root, '--review', 'case-03'), 'no-rubric-row');
  });
});

// Added 2026-11-09 (owner approval): directory junctions need no admin rights on Windows and Node
// reports them as links, so they test the link refusal where file symlinks cannot be created.
describe('linked folders (directory junctions)', () => {
  /** A folder outside the project holding a full case; returns its path. */
  function outsideCase(caseId) {
    const outside = mkdtempSync(join(tmpdir(), 'aq-outside-'));
    temps.push(outside);
    const dir = join(outside, caseId);
    mkdirSync(dir);
    writeFileSync(join(dir, 'case.json'), JSON.stringify(goodManifest(caseId)));
    writeFileSync(join(dir, 'requirement.md'), 'OUTSIDE-CONTENT\n');
    writeFileSync(join(dir, 'run-summary.json'), '{}\n');
    return dir;
  }

  function junction(t, target, path) {
    try {
      symlinkSync(target, path, 'junction');
      return true;
    } catch {
      t.skip('this system does not allow creating a directory junction');
      return false;
    }
  }

  test('a case folder that is a junction is refused and nothing outside is read', (t) => {
    const root = project();
    if (!junction(t, outsideCase('case-02'), join(root, FIXTURES, 'case-02'))) return;
    const result = selfHeal(root, 'case-02');
    assertInputError(result, 'link-not-allowed');
    assert.doesNotMatch(result.out, /OUTSIDE-CONTENT/);
  });

  test('an answers folder that is a junction is refused as a link', (t) => {
    const root = project();
    const outside = mkdtempSync(join(tmpdir(), 'aq-outside-'));
    temps.push(outside);
    writeFileSync(join(outside, 'self-heal-20261109T100000Z.md'), 'OUTSIDE-REPLY\n');
    mkdirSync(join(root, 'evidence/agent-quality/answers'), { recursive: true });
    if (!junction(t, outside, join(root, 'evidence/agent-quality/answers/case-01'))) return;
    const result = run(root, '--review', 'case-01');
    assertInputError(result, 'link-not-allowed');
    assert.doesNotMatch(result.out, /OUTSIDE-REPLY/);
  });
});
