// The heal service. Runs on the Sprite, behind the Sprite's URL, so a request
// wakes the Sprite up. See app.mjs for what it does with each event.
//
// When the invoices task breaks, it starts Claude Code in a fresh worktree,
// with a prompt for what happened: review Anchor's draft, or re-explore and
// recompile. The agent opens a PR. A person merges it.

import { execFile, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { loadSpec } from '../integration/task.mjs';
import { createHealApp } from './app.mjs';
import { healPrompt } from './prompt.mjs';

const run = promisify(execFile);
const port = Number(process.env.PORT ?? 8080);
const REPO = resolve(process.env.REPO_DIR ?? '.');
const WORK = resolve(REPO, '..', 'heal-worktrees');
const LOGS = resolve(REPO, 'data', 'heal');
const TOOLS = [
  'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'Bash(npm ci)', 'Bash(npm test)', 'Bash(npm run *)',
  'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)', 'Bash(git add *)', 'Bash(git commit *)', 'Bash(git push *)',
  'Bash(gh pr create *)', 'Bash(gh pr view *)',
];

mkdirSync(LOGS, { recursive: true });

async function startAgent(event) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const branch = `heal/${stamp}-${event.kind}`;
  const dir = join(WORK, branch.replace('/', '-'));
  await run('git', ['fetch', 'origin'], { cwd: REPO });
  await run('git', ['worktree', 'add', '-b', branch, dir, 'origin/main'], { cwd: REPO });

  const logFile = join(LOGS, `${branch.replace('/', '-')}.log`);
  const log = createWriteStream(logFile);
  const agent = spawn('claude', ['-p', healPrompt(event, branch), '--allowedTools', ...TOOLS], {
    cwd: dir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  agent.stdout.pipe(log);
  agent.stderr.pipe(log);
  const code = await new Promise((done) => {
    agent.on('error', () => done('could not start claude'));
    agent.on('close', done);
  });
  await run('git', ['worktree', 'remove', '--force', dir], { cwd: REPO }).catch(() => {});
  return `${branch} exited ${code}, log ${logFile}`;
}

// Expired sign-ins are a person's job: the agent never handles the password.
let lastAsked = 0;
async function askForSignIn(detail) {
  if (Date.now() - lastAsked < 60 * 60 * 1000) return;
  lastAsked = Date.now();
  await run('gh', ['issue', 'create', '--title', 'Hangar Supply profile is signed out',
    '--body', `The invoices task could not sign in: ${detail}\n\nRun \`npm run connect\` on the Sprite and sign in through the live view.`],
  { cwd: REPO });
}

const { app } = createHealApp({
  taskId: () => loadSpec(join(REPO, 'tasks', 'invoices.json')).taskId,
  startAgent,
  askForSignIn,
  graceMs: Number(process.env.HEAL_GRACE_SECONDS ?? 180) * 1000,
  webhookSecrets: [process.env.ANCHOR_WEBHOOK_SECRET, process.env.ANCHOR_WEBHOOK_SECRET_PREVIOUS],
  healToken: process.env.HEAL_TOKEN,
});

app.listen(port, () => console.log(`heal listening on :${port}, repo ${REPO}`));
