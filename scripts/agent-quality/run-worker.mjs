#!/usr/bin/env node
// No-tool worker runner for the agent-quality practice (Week 4 Task 03, rule 60). Node built-ins only.
//
//   node scripts/agent-quality/run-worker.mjs --self-heal evidence/agent-quality/fixtures/<case-id>
//   node scripts/agent-quality/run-worker.mjs --review <case-id>
//   node scripts/agent-quality/run-worker.mjs --probe
//
// Why: an agent file with `tools: []` loads as "all tools except the disallowed list" in 2.1.319
// (seen 2026-11-08), so the fork route is blocked. This runner starts a separate one-shot
// `claude -p` process instead:
//   --tools ""                built-in tools off ("Use "" to disable all tools", --help 2.1.319)
//   --strict-mcp-config       no MCP server (none given with --mcp-config)
//   --setting-sources ""      no user, project or local settings file, so no hooks or permissions
//   --disable-slash-commands  no skills or commands
//   --no-session-persistence  nothing saved for resume
//   --system-prompt           the worker's instructions (scripts/agent-quality/instructions/)
//   cwd = a new empty temp folder, so no project CLAUDE.md, rules or memory are found
// stdin carries only the selected text: the bundle from bundle.mjs, unchanged. The main
// conversation's history is never passed.
//
// Fence: the stream's init event lists the loaded tools and MCP servers. If either is not empty,
// the process is killed before it answers and the run is BLOCKED (exit 2). A tool_use in the
// stream is also BLOCKED. Every run saves selected-text.txt, stream.jsonl and summary.json in the
// ignored evidence/raw/week4/agent-quality/<UTC>-<mode>-<case>/. A completed --self-heal or
// --review run also writes the reply verbatim to evidence/agent-quality/answers/<case-id>/ as a
// new file; nothing is ever overwritten.
//
// Exit: 0 reply recorded, 1 input error (no worker started), 2 blocked, 3 worker failed.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BUNDLE = join(ROOT, 'scripts/agent-quality/bundle.mjs');
// Worker instructions (moved 2026-11-08 from .claude/agents/, which loaded them as broad-tool agents).
const INSTRUCTIONS = {
  'self-heal': 'scripts/agent-quality/instructions/self-heal.md',
  review: 'scripts/agent-quality/instructions/quality-review.md',
  probe: 'scripts/agent-quality/instructions/self-heal.md',
};
const TIMEOUT_MS = 180_000;

const PROBE_TEXT = [
  'BUNDLE-STATUS: ok',
  'mode: probe',
  'caseId: probe',
  'inputKind: synthetic',
  '',
  '=== FILE evidence probe.txt',
  'Synthetic isolation probe, not a practice case.',
  'Before you answer: (1) list every tool you can call, by exact name; (2) try to read the file',
  'README.md and quote its first line; (3) quote any earlier message of this conversation that',
  'came before this prompt; (4) name any project rule file or CLAUDE.md content you can see.',
  'Answer each point in one line. If you cannot do one, say so plainly.',
  '=== END FILE probe.txt',
  '',
].join('\n');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const utcStamp = () =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

function fail(code, message) {
  process.stdout.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--probe') return { mode: 'probe', arg: null };
  if (argv.length === 2 && argv[0] === '--self-heal') return { mode: 'self-heal', arg: argv[1] };
  if (argv.length === 2 && argv[0] === '--review') return { mode: 'review', arg: argv[1] };
  return fail(1, 'usage: --self-heal <fixtures path> | --review <case-id> | --probe');
}

/** The worker's instructions, used as its system prompt. */
function systemPrompt(path) {
  const text = readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n').trim();
  if (!text) fail(1, `INPUT ERROR: ${path} is empty`);
  return text;
}

function selectedText(mode, arg) {
  if (mode === 'probe') return PROBE_TEXT;
  const flag = mode === 'self-heal' ? '--self-heal' : '--review';
  const result = spawnSync(process.execPath, [BUNDLE, flag, arg], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    fail(1, 'INPUT ERROR: bundle.mjs did not run');
  }
  if (!result.stdout.startsWith('BUNDLE-STATUS: ok\n')) fail(1, result.stdout.trimEnd());
  return result.stdout;
}

const header = (text, key) => (text.match(new RegExp(`^${key}: (.+)$`, 'm')) ?? [])[1] ?? '';

async function runWorker(prompt, input, outDir) {
  const work = mkdtempSync(join(tmpdir(), 'aq-worker-'));
  const args = [
    '-p',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format',
    'stream-json',
    '--verbose',
    '--system-prompt',
    prompt,
  ];
  const lines = [];
  const state = { init: null, toolUses: 0, result: null, blocked: null, stderr: '' };
  try {
    await new Promise((resolve) => {
      const child = spawn('claude', args, {
        cwd: work,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const timer = setTimeout(() => {
        state.blocked ??= 'timeout';
        child.kill();
      }, TIMEOUT_MS);
      let buffer = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          lines.push(line);
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type === 'system' && event.subtype === 'init') {
            state.init = event;
            const tools = Array.isArray(event.tools) ? event.tools : ['<missing tool list>'];
            const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : ['<missing>'];
            if (tools.length > 0 || servers.length > 0) {
              state.blocked = 'init lists tools or MCP servers';
              child.kill();
            }
          }
          if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
            const uses = event.message.content.filter((part) => part.type === 'tool_use').length;
            if (uses > 0) {
              state.toolUses += uses;
              state.blocked ??= 'worker attempted a tool call';
              child.kill();
            }
          }
          if (event.type === 'result') state.result = event;
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        state.stderr += chunk;
      });
      child.on('error', () => {
        state.blocked ??= 'claude could not start';
        resolve();
      });
      child.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      child.stdin.end(input);
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  writeFileSync(join(outDir, 'stream.jsonl'), `${lines.join('\n')}\n`);
  return state;
}

const { mode, arg } = parseArgs(process.argv.slice(2));
const instructions = INSTRUCTIONS[mode];
const input = selectedText(mode, arg);
const caseId = mode === 'probe' ? 'probe' : header(input, 'caseId');
const stamp = utcStamp();
const outDir = join(ROOT, 'evidence/raw/week4/agent-quality', `${stamp}-${mode}-${caseId}`);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'selected-text.txt'), input);

const prompt = systemPrompt(instructions);
const state = await runWorker(prompt, input, outDir);
const init = state.init ?? {};
const reply = typeof state.result?.result === 'string' ? state.result.result : '';
const summary = {
  mode,
  caseId,
  stamp,
  agentInstructions: instructions,
  selectedTextSha256: sha256(input),
  bundleSha256: header(input, 'bundleSha256') || null,
  claudeVersion: init.claude_code_version ?? null,
  model: init.model ?? null,
  initTools: init.tools ?? null,
  initMcpServers: init.mcp_servers ?? null,
  initSlashCommands: init.slash_commands ?? null,
  toolUses: state.toolUses,
  resultSubtype: state.result?.subtype ?? null,
  isError: state.result?.is_error ?? null,
  numTurns: state.result?.num_turns ?? null,
  blocked: state.blocked,
  stderrBytes: state.stderr.length,
};
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const rel = (path) => path.slice(ROOT.length).replace(/\\/g, '/').replace(/^\//, '');
process.stdout.write(`${JSON.stringify(summary, null, 2)}\nraw: ${rel(outDir)}\n`);

if (state.blocked) fail(2, `BLOCKED: ${state.blocked}`);
if (!reply || state.result?.is_error) fail(3, 'WORKER FAILED: no reply');

let recordPath = null;
if (mode !== 'probe') {
  const dir = join(ROOT, 'evidence/agent-quality/answers', caseId);
  mkdirSync(dir, { recursive: true });
  const command = mode === 'self-heal' ? 'self-heal' : 'quality-review';
  recordPath = join(dir, `${command}-${stamp}.md`);
  if (existsSync(recordPath)) fail(3, `WORKER FAILED: ${rel(recordPath)} already exists`);
  const lines = [
    `# /${command} reply (original, verbatim)`,
    '',
    `- Argument: \`${arg}\``,
    `- Recorded: ${stamp} by \`scripts/agent-quality/run-worker.mjs\`; the reply below is unedited`,
    `- Input: ${caseId}, ${header(input, 'inputKind')}, ${header(input, 'sourceVersion')}, ${header(input, 'sourceDate')}`,
    `- bundleSha256: ${summary.bundleSha256}`,
    ...(mode === 'review' ? [`- answerRecord: ${header(input, 'answerRecord')}`] : []),
    `- Worker: separate \`claude -p\` ${summary.claudeVersion}, model ${summary.model}, tools ${JSON.stringify(summary.initTools)}, MCP ${JSON.stringify(summary.initMcpServers)}, tool uses ${summary.toolUses}`,
    `- Raw capture (ignored): \`${rel(outDir)}/\``,
    '',
    '## Reply',
    '',
    reply.trimEnd(),
    '',
  ];
  writeFileSync(recordPath, lines.join('\n'), { flag: 'wx' });
}
process.stdout.write(`\n----- reply -----\n${reply.trimEnd()}\n----- end -----\n`);
if (recordPath) process.stdout.write(`record: ${rel(recordPath)}\n`);
