// Isolated checks for .claude/hooks/fleet-log.mjs (Week 3 Task 08B). node:test, no browser, no network.
// Every case runs the real script by absolute path with a simulated hook event on stdin and
// CLAUDE_PROJECT_DIR set to a fresh temporary folder, so the project's own fleet log is never written.
// Paths in the events are made up.
// Not covered: CLAUDE_PROJECT_DIR unset (the log would go to this project's .claude/fleet-log.txt).

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const LOGGER = fileURLToPath(new URL('../.claude/hooks/fleet-log.mjs', import.meta.url));
const BOM = '\uFEFF';
const FAKE_PATH = 'C:\\Users\\example\\.claude\\projects\\p\\t.jsonl';
const TEMP = mkdtempSync(join(tmpdir(), 'fleet-log-test-'));
let next = 0;

after(() => rmSync(TEMP, { recursive: true, force: true }));

/** A new project folder with an empty .claude/ inside, and the path its log would have. */
function project() {
  const root = join(TEMP, `p${next++}`);
  mkdirSync(join(root, '.claude'), { recursive: true });
  return { root, log: join(root, '.claude', 'fleet-log.txt') };
}

/** Runs the logger with `input` (object → JSON, string as given; undefined → no stdin). */
function logger(input, root) {
  const options = {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  };
  if (input === undefined) options.stdio = ['ignore', 'pipe', 'pipe'];
  else options.input = typeof input === 'object' ? JSON.stringify(input) : input;
  const result = spawnSync(process.execPath, [LOGGER], options);
  assert.equal(result.error, undefined);
  return result;
}

/** Exit 0 and nothing on stdout or stderr. */
function assertSilent(result) {
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
}

function lines(log) {
  return readFileSync(log, 'utf8')
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
}

const START = {
  hook_event_name: 'SubagentStart',
  session_id: 's-1',
  agent_id: 'a-1',
  agent_type: 'test-designer',
  prompt_id: 'p-1',
  cwd: 'C:\\Users\\example\\project',
  transcript_path: FAKE_PATH,
  scratchpad_dir: 'C:\\Users\\example\\tmp',
  permission_mode: 'default',
};
const REPLY = 'Sources read … A-1 ünïcode';
const STOP = {
  hook_event_name: 'SubagentStop',
  session_id: 's-1',
  agent_id: 'a-1',
  agent_type: 'test-designer',
  stop_hook_active: false,
  last_assistant_message: REPLY,
  agent_transcript_path: FAKE_PATH,
  transcript_path: FAKE_PATH,
};

describe('fleet log: one line per subagent event', () => {
  test('SubagentStart: exactly the start fields, logger time in UTC', () => {
    const { root, log } = project();
    assertSilent(logger(START, root));
    const [line] = lines(log);
    assert.deepEqual(Object.keys(line), [
      'ts',
      'event',
      'agent_id',
      'agent_type',
      'session_id',
      'prompt_id',
    ]);
    assert.match(line.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(line.event, 'SubagentStart');
    assert.equal(line.agent_id, 'a-1');
    assert.equal(line.agent_type, 'test-designer');
    assert.equal(line.session_id, 's-1');
    assert.equal(line.prompt_id, 'p-1');
  });

  test('SubagentStop: reply SHA-256 and length, never the reply text', () => {
    const { root, log } = project();
    assertSilent(logger(STOP, root));
    const [line] = lines(log);
    assert.equal(line.event, 'SubagentStop');
    assert.equal(line.prompt_id, null);
    assert.equal(line.stop_hook_active, false);
    assert.equal(line.reply_type, 'string');
    assert.equal(line.reply_sha256, createHash('sha256').update(REPLY, 'utf8').digest('hex'));
    assert.equal(line.reply_chars, REPLY.length);
    assert.ok(!readFileSync(log, 'utf8').includes('Sources read'));
  });

  test('no path value from the event is written', () => {
    const { root, log } = project();
    logger(START, root);
    logger(STOP, root);
    const text = readFileSync(log, 'utf8');
    assert.ok(!text.includes('Users'));
    assert.ok(!text.includes('jsonl'));
  });

  test('a Start and its Stop pair by session_id + agent_id', () => {
    const { root, log } = project();
    logger(START, root);
    logger(STOP, root);
    const [start, stop] = lines(log);
    assert.equal(start.event, 'SubagentStart');
    assert.equal(stop.event, 'SubagentStop');
    assert.equal(`${start.session_id}/${start.agent_id}`, `${stop.session_id}/${stop.agent_id}`);
  });

  test('missing or non-string fields are null; a non-string reply has no SHA', () => {
    const { root, log } = project();
    assertSilent(
      logger({ hook_event_name: 'SubagentStop', agent_id: 7, last_assistant_message: {} }, root),
    );
    const [line] = lines(log);
    assert.equal(line.agent_id, null);
    assert.equal(line.agent_type, null);
    assert.equal(line.session_id, null);
    assert.equal(line.reply_type, 'object');
    assert.equal(line.reply_sha256, null);
    assert.equal(line.reply_chars, null);
  });

  test('reply_type names what was sent instead of a string, never its content', () => {
    const { root, log } = project();
    const replies = [undefined, null, ['part one'], 42, true];
    for (const reply of replies) {
      const event = { hook_event_name: 'SubagentStop', agent_id: 'a-1' };
      if (reply !== undefined) event.last_assistant_message = reply;
      assertSilent(logger(event, root));
    }
    const found = lines(log);
    assert.deepEqual(
      found.map((line) => line.reply_type),
      ['undefined', 'null', 'array', 'number', 'boolean'],
    );
    assert.ok(found.every((line) => line.reply_sha256 === null && line.reply_chars === null));
    assert.ok(!readFileSync(log, 'utf8').includes('part one'));
  });

  test('stdin with a byte-order mark is still logged', () => {
    const { root, log } = project();
    assertSilent(logger(BOM + JSON.stringify(START), root));
    assert.equal(lines(log).length, 1);
  });

  test('lines are appended, never overwritten', () => {
    const { root, log } = project();
    for (let i = 0; i < 3; i++) logger(START, root);
    assert.equal(lines(log).length, 3);
  });

  test('two loggers started together write two whole lines', async () => {
    const { root, log } = project();
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root };
    await Promise.all(
      ['a-1', 'a-2'].map(
        (agent_id) =>
          new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [LOGGER], { env, windowsHide: true });
            child.on('error', reject);
            child.on('exit', resolve);
            child.stdin.end(JSON.stringify({ ...START, agent_id }));
          }),
      ),
    );
    assert.deepEqual(
      lines(log)
        .map((line) => line.agent_id)
        .sort(),
      ['a-1', 'a-2'],
    );
  });
});

describe('fleet log: fails open and stays silent', () => {
  for (const [name, input] of [
    ['no stdin', undefined],
    ['empty stdin', ''],
    ['malformed JSON', '{"hook_event_name":'],
    ['JSON array', '[]'],
    ['JSON null', 'null'],
    ['Stop (not a subagent event)', { hook_event_name: 'Stop', session_id: 's-1' }],
    ['PreToolUse', { hook_event_name: 'PreToolUse', tool_name: 'Edit' }],
    ['no event name', { agent_id: 'a-1' }],
  ]) {
    test(`ignored, nothing written: ${name}`, () => {
      const { root, log } = project();
      assertSilent(logger(input, root));
      assert.equal(existsSync(log), false);
    });
  }

  test('a log folder that does not exist: exit 0, silent, nothing created', () => {
    const root = join(TEMP, 'missing', 'project');
    assertSilent(logger(START, root));
    assert.equal(existsSync(root), false);
  });
});
