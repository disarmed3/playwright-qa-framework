// Isolated policy checks for .github/workflows/ci.yml (Week 5 Task 04). node:test; the workflow is read
// as text only: no YAML parser, no network, no browser, no GitHub call. These checks keep the reviewed
// shape from drifting; they do not prove how GitHub runs the file (the first pull request run does).
// Not part of `npm run test:safety` (package.json is CRITICAL); CI and
// `node --test safety-tests/ci-workflow.test.mjs` run it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const text = readFileSync(
  fileURLToPath(new URL('../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);
const lines = text.replace(/\r/g, '').split('\n');
const code = lines.filter((line) => !line.trimStart().startsWith('#'));
const codeText = code.join('\n');

/** { name: text of the job's lines } for each entry under `jobs:`. */
function jobs() {
  const out = {};
  let current;
  let inJobs = false;
  for (const line of code) {
    if (line === 'jobs:') {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    const start = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (start) {
      current = start[1];
      out[current] = [];
    } else if (current) out[current].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([name, body]) => [name, body.join('\n')]));
}
const J = jobs();

describe('triggers and scope', () => {
  test('exactly the planned jobs exist', () => {
    assert.deepEqual(Object.keys(J), ['static', 'browser', 'ci-result', 'pr-summary']);
  });

  test('no pull_request_target, no schedule, no cron, no other privileged or recurring trigger', () => {
    for (const forbidden of [
      /pull_request_target/,
      /^\s*schedule:/m,
      /cron:/,
      /workflow_run/,
      /repository_dispatch/,
    ]) {
      assert.doesNotMatch(codeText, forbidden);
    }
  });

  test('the triggers are pull_request to main, push to main and workflow_dispatch', () => {
    const on = /^on:\n([\s\S]*?)\n\npermissions:/m.exec(codeText)?.[1] ?? '';
    assert.match(
      on,
      /pull_request:\n {4}branches: \[main\]\n {4}types: \[opened, synchronize, reopened, ready_for_review\]/,
    );
    assert.match(on, /push:\n {4}branches: \[main\]/);
    assert.match(on, /workflow_dispatch:/);
    assert.deepEqual(
      [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]),
      ['pull_request', 'push', 'workflow_dispatch'],
    );
  });

  test('the only manual scopes are smoke and regression, defaulting to smoke', () => {
    assert.match(codeText, /options: \[smoke, regression\]\n\s+default: smoke/);
  });
});

describe('target and inputs', () => {
  test('the workflow never sets the target: no APP_ENV, BASE_URL, LOCAL_SANDBOX_DIR or prod script', () => {
    assert.doesNotMatch(codeText, /^\s*(APP_ENV|BASE_URL|LOCAL_SANDBOX_DIR)\s*:/m);
    assert.doesNotMatch(codeText, /test:prod/);
    assert.doesNotMatch(codeText, /APP_ENV=/);
  });

  // Changed 2026-11-24 (owner's approval, CROSS-IMPACT recorded in pull request #8 of the course repository):
  // `secrets.` was forbidden everywhere; now only the six teaching-login names are allowed,
  // each as `NAME: ${{ secrets.NAME }}`, in exactly the two browser steps below. Any other secret fails.
  test('the only secrets are the six teaching logins, in the dev-test and scrub steps of `browser`', () => {
    const LOGINS = [
      'AUTHOR_EMAIL',
      'AUTHOR_PASSWORD',
      'ADMIN_EMAIL',
      'ADMIN_PASSWORD',
      'OTHER_AUTHOR_EMAIL',
      'OTHER_AUTHOR_PASSWORD',
    ];
    const STEPS = ['Run the dev tests', 'Scrub before upload'];
    assert.doesNotMatch(codeText, /secrets\s*\[|toJSON\(\s*secrets|\bsecrets\s*\}\}/);
    for (const job of ['static', 'ci-result', 'pr-summary']) assert.doesNotMatch(J[job], /secrets/);
    const steps = J.browser.split(/\n(?= {6}- )/);
    for (const step of steps) {
      const refs = [...step.matchAll(/secrets/g)].length;
      if (refs === 0) continue;
      const name = / {6}- name: (.+)/.exec(step)?.[1];
      assert.ok(STEPS.includes(name), `secrets only in ${STEPS.join(' and ')}, found in: ${name}`);
      const pairs = [...step.matchAll(/^ {10}([A-Z_]+): \$\{\{ secrets\.([A-Z_]+) \}\}$/gm)];
      assert.equal(
        pairs.length,
        refs,
        `every secret in "${name}" is one NAME: \${{ secrets.NAME }} line`,
      );
      assert.deepEqual(
        pairs.map((m) => m[1]),
        LOGINS,
      );
      for (const m of pairs) assert.equal(m[1], m[2]);
    }
    assert.equal([...codeText.matchAll(/secrets\./g)].length, LOGINS.length * STEPS.length);
  });

  test('no service or model call: no Slack, database URL, MCP or Claude', () => {
    assert.doesNotMatch(codeText, /SLACK_|--send|--check-connection|ANTHROPIC|claude|mcp/i);
    assert.doesNotMatch(codeText, /DATABASE_URI|--approve-digest/);
  });

  test('the only database setting is the explicit empty one, inside the proof step', () => {
    assert.deepEqual(
      [...codeText.matchAll(/STUDENT_DATABASE_URL: (.*)/g)].map((m) => m[1]),
      ["''"],
    );
    assert.match(
      J.static,
      /optional-input-proof[\s\S]*QA_DB: '1'[\s\S]*STUDENT_DATABASE_URL: ''[\s\S]*npm test -- tests\/db/,
    );
  });

  test('untrusted event text never reaches a script: no head ref, title, body or branch name', () => {
    assert.doesNotMatch(
      codeText,
      /github\.head_ref|pull_request\.title|pull_request\.body|head\.ref|github\.ref_name/,
    );
  });
});

describe('dependencies, status functions and gates', () => {
  test('browser needs static and requires its success, with no always() or cancelled()', () => {
    assert.match(J.browser, /^\s+needs: static$/m);
    const condition = /^\s+if: >-\n([\s\S]*?)\n\s+runs-on:/m.exec(J.browser)?.[1] ?? '';
    assert.match(condition, /needs\.static\.result == 'success'/);
    assert.doesNotMatch(condition, /always\(\)|cancelled\(\)|failure\(\)/);
    assert.doesNotMatch(J.browser.split('\n    steps:')[0], /always\(\)/);
  });

  test('the dev job skips drafts and other repositories, and regression runs only by hand from main', () => {
    assert.match(J.browser, /github\.event\.pull_request\.draft == false/);
    assert.match(J.browser, /head\.repo\.full_name == github\.repository/);
    assert.match(J.browser, /inputs\.scope == 'smoke' \|\| github\.ref == 'refs\/heads\/main'/);
  });

  test('always() appears only as the job condition of ci-result and pr-summary', () => {
    for (const [name, body] of Object.entries(J)) {
      const header = body.split('\n    steps:')[0];
      const used = /always\(\)/.test(header);
      assert.equal(used, name === 'ci-result' || name === 'pr-summary', name);
      assert.doesNotMatch(body.slice(header.length), /always\(\)/, `${name} steps`);
    }
  });

  test('ci-result needs both jobs, has no permissions and fails unless both succeeded', () => {
    assert.match(J['ci-result'], /needs: \[static, browser\]/);
    assert.match(J['ci-result'], /permissions: \{\}/);
    assert.match(J['ci-result'], /\[ "\$STATIC" = success \] \|\|/);
    assert.match(J['ci-result'], /\[ "\$BROWSER" = success \] && exit 0/);
  });

  test('static steps use !cancelled() and no step hides a failure with continue-on-error', () => {
    const steps = J.static.split('\n      - ').slice(1);
    for (const step of steps.filter((s) =>
      /id: (format|lint|typecheck|env-gates|collection|safety|git-hooks|ci-tests|vault-check|vault-links|optional-input-proof)\b/.test(
        s,
      ),
    )) {
      assert.match(step, /if: \$\{\{ !cancelled\(\) && steps\.install\.outcome == 'success' \}\}/);
    }
    assert.doesNotMatch(J.static, /continue-on-error/);
    assert.doesNotMatch(J.browser, /continue-on-error/);
  });

  test('continue-on-error appears only in pr-summary (the job and the optional download)', () => {
    assert.equal((codeText.match(/continue-on-error/g) ?? []).length, 2);
    assert.equal((J['pr-summary'].match(/continue-on-error/g) ?? []).length, 2);
  });
});

describe('permissions, pinning and concurrency', () => {
  test('workflow permissions are empty and every job states its own', () => {
    assert.match(codeText, /^permissions: \{\}$/m);
    for (const [name, body] of Object.entries(J)) assert.match(body, /^\s{4}permissions:/m, name);
  });

  test('narrow job permissions: contents read for checkout jobs, pull-requests write only in pr-summary', () => {
    assert.match(J.static, /permissions:\n {6}contents: read/);
    assert.match(J.browser, /permissions:\n {6}contents: read/);
    assert.match(J['ci-result'], /permissions: \{\}/);
    assert.match(J['pr-summary'], /permissions:\n {6}pull-requests: write\n/);
    assert.equal((codeText.match(/: write/g) ?? []).length, 1);
  });

  test('pr-summary has no checkout and only acts for a pull request from this repository', () => {
    assert.doesNotMatch(J['pr-summary'], /actions\/checkout/);
    assert.match(
      J['pr-summary'],
      /github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.repo\.full_name == github\.repository/,
    );
    assert.match(J['pr-summary'], /github-actions\[bot\]/);
    assert.match(J['pr-summary'], /--paginate/);
  });

  test('every action is a GitHub-owned action pinned to a full commit SHA with its tag in a comment', () => {
    const uses = code.filter((line) => /^\s+(- )?uses:/.test(line));
    assert.ok(uses.length >= 7);
    for (const line of uses) {
      assert.match(line, /uses: actions\/[a-z-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/, line);
    }
  });

  test('every checkout drops its token', () => {
    const checkouts = codeText.split('actions/checkout@').slice(1);
    assert.ok(checkouts.length >= 2);
    for (const rest of checkouts) assert.match(rest.slice(0, 200), /persist-credentials: false/);
  });

  test('dev runs queue in one group and are never cancelled; static is cancelled only on pull requests', () => {
    assert.match(J.browser, /group: qa-dev-target\n\s+cancel-in-progress: false/);
    assert.match(J.static, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  test('every job has a timeout', () => {
    for (const [name, body] of Object.entries(J)) assert.match(body, /timeout-minutes:/, name);
  });
});

describe('uploads', () => {
  test('both uploads keep 14 days and run only after the scrub step succeeded', () => {
    const uploads = codeText.split('actions/upload-artifact@').slice(1);
    assert.equal(uploads.length, 2);
    for (const rest of uploads) {
      assert.match(rest.slice(0, 700), /retention-days: 14/);
    }
    assert.equal((J.browser.match(/steps\.scrub\.outcome == 'success'/g) ?? []).length, 2);
  });

  test('traces, test-results, login state and .env are never uploaded', () => {
    const paths = [...codeText.matchAll(/path: ([\s\S]*?)if-no-files-found/g)].map((m) => m[1]);
    assert.equal(paths.length, 2);
    for (const value of paths)
      assert.doesNotMatch(value, /test-results|trace|\.auth|storage|\.env|playwright-report/i);
  });

  test('the HTML report cannot open a server and goes to the runner temp folder', () => {
    assert.match(J.browser, /PLAYWRIGHT_HTML_OPEN: never/);
    assert.match(J.browser, /PLAYWRIGHT_HTML_OUTPUT_DIR: \$\{\{ runner\.temp \}\}\/pw\/html/);
  });

  test('the scrub step runs before the first upload and the summary keeps the failing exit status', () => {
    assert.ok(J.browser.indexOf('id: scrub') < J.browser.indexOf('actions/upload-artifact'));
    assert.match(J.browser, /echo "exit=\$code" >> "\$GITHUB_OUTPUT"\n\s+exit "\$code"/);
    assert.match(J.browser, /npm test -- --grep "\$tag" --reporter=list,json,html/);
  });
});

describe('static checks listed', () => {
  test('the static job runs each reviewed local check', () => {
    for (const command of [
      'npm run format:check',
      'npm run lint',
      'npm run typecheck',
      'npm run check:env-gates',
      'npm run test:list',
      'npm run test:safety',
      'npm run test:git-hooks',
      'npm run vault:check',
      'npm run vault:validate',
      'safety-tests/slack-report.test.mjs safety-tests/ci-summary.test.mjs safety-tests/ci-workflow.test.mjs',
    ]) {
      assert.ok(J.static.includes(command), command);
    }
    assert.match(J.static, /run: npm ci\n/);
  });

  test('the static job has no browser install and no dev run', () => {
    assert.doesNotMatch(J.static, /playwright install/);
    assert.doesNotMatch(J.static, /--grep/);
  });
});

// Added 2026-11-14 (Week 5 Task 04, rule 55): CI never writes to Jira.
describe('no Jira writeback in CI', () => {
  test('no Jira credential name, writeback script, gate variable or Atlassian host in the workflow', () => {
    assert.doesNotMatch(codeText, /JIRA_|QA_JIRA_WRITE|writeback|scripts\/jira\/|atlassian/i);
  });
});
