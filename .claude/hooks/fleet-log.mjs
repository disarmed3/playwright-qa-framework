#!/usr/bin/env node
// Fleet log for subagent runs (Week 3 Task 08B). Node built-ins only.
//
// Claude Code runs this as a SubagentStart and SubagentStop hook and writes the event as JSON to
// stdin. Each event appends one JSON line to .claude/fleet-log.txt (git-ignored):
//
//   ts, event, agent_id, agent_type, session_id, prompt_id          every event
//   stop_hook_active, reply_type, reply_sha256, reply_chars         SubagentStop only
//
// Claude Code sends no timestamp, so `ts` is this script's clock (UTC). Start and Stop pair by
// session_id + agent_id; prompt_id is optional in the input and is null when absent. The reply text
// (last_assistant_message) is never written, only its SHA-256 and length, so a saved proposal can be
// matched to its run. The hash needs a string; reply_type records what was sent instead (added after
// run t08b-20261031-r1, where all three Stop lines had no string). cwd, transcript_path,
// agent_transcript_path and scratchpad_dir are never written: they hold the local user path.
//
// FAILS OPEN and stays silent: always exit 0, nothing on stdout or stderr. A SubagentStop exit 2
// would keep the subagent running, and SubagentStart output can reach the subagent's context.
// Malformed input, other events and write errors are ignored. The log goes under
// CLAUDE_PROJECT_DIR, or under this script's own project when that is unset.

import { appendFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EVENTS = new Set(['SubagentStart', 'SubagentStop']);

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** A non-empty string, else null. */
function field(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** The value's type only: `array` and `null` apart from `object`, else `typeof`. */
function typeName(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'array' : typeof value;
}

function entry(event) {
  const line = {
    ts: new Date().toISOString(),
    event: event.hook_event_name,
    agent_id: field(event.agent_id),
    agent_type: field(event.agent_type),
    session_id: field(event.session_id),
    prompt_id: field(event.prompt_id),
  };
  if (event.hook_event_name === 'SubagentStop') {
    const reply =
      typeof event.last_assistant_message === 'string' ? event.last_assistant_message : null;
    line.stop_hook_active = event.stop_hook_active === true;
    line.reply_type = typeName(event.last_assistant_message);
    line.reply_sha256 =
      reply === null ? null : createHash('sha256').update(reply, 'utf8').digest('hex');
    line.reply_chars = reply === null ? null : reply.length;
  }
  return line;
}

function main() {
  let event;
  try {
    event = JSON.parse(readStdin().replace(/^\uFEFF+/, ''));
  } catch {
    return;
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return;
  if (!EVENTS.has(event.hook_event_name)) return;

  const fromEnv = process.env.CLAUDE_PROJECT_DIR;
  const root = typeof fromEnv === 'string' && fromEnv.trim() !== '' ? fromEnv : SCRIPT_ROOT;
  appendFileSync(
    join(root, '.claude', 'fleet-log.txt'),
    `${JSON.stringify(entry(event))}\n`,
    'utf8',
  );
}

try {
  main();
} catch {
  // fails open
}
process.exitCode = 0;
