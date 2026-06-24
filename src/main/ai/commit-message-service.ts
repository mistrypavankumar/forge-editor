import { spawn } from 'node:child_process';
import { getCommitDiff } from '../git/git-service';

/**
 * AI commit messages are produced by the user's own Claude Code CLI (`claude`) in headless print
 * mode — no API key, no extra dependency: it reuses whatever auth `claude` already has. We pipe the
 * diff in on stdin (avoiding ARG_MAX limits) and pass only the instruction via `-p`. A fast model,
 * a single turn, and no tools keep it cheap and non-agentic (it answers from the diff alone).
 */
const CLAUDE_MODEL = 'claude-haiku-4-5';
const CLAUDE_TIMEOUT_MS = 60_000;

const PROMPT = [
  'You are writing a git commit message for the staged/working changes shown on stdin as a diff.',
  'Rules:',
  '- Use the imperative mood ("Add", "Fix", "Refactor"), not past tense.',
  '- First line: a concise summary under 72 characters. No trailing period.',
  '- If the change is non-trivial, add a blank line then 1-3 short bullet points ("- …").',
  '- Describe what changed and why, not the mechanics of the diff.',
  '- Do NOT wrap the message in quotes, backticks, or markdown code fences.',
  '- Output ONLY the commit message — no preamble, no explanation.',
].join('\n');

/** Run the `claude` CLI headlessly, feeding `stdin` and resolving with its trimmed stdout. */
function runClaude(prompt: string, stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', prompt, '--model', CLAUDE_MODEL, '--max-turns', '1', '--allowed-tools', ''],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for Claude.'));
    }, CLAUDE_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      // ENOENT here means the `claude` CLI isn't on PATH.
      reject(
        new Error(
          (e as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'Claude Code CLI (`claude`) not found on PATH. Install it to generate commit messages.'
            : `Could not run claude: ${e.message}`,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim() || `claude exited with code ${code}.`));
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** Strip any stray code fences / surrounding quotes a model might add, then trim. */
function cleanMessage(raw: string): string {
  let m = raw.trim();
  if (m.startsWith('```')) m = m.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim();
  if (m.length > 1 && m.startsWith('"') && m.endsWith('"')) m = m.slice(1, -1).trim();
  return m;
}

/**
 * Generate a commit message describing the repo's pending changes, using the local `claude` CLI.
 * Throws when there's nothing to describe or the CLI is unavailable/fails.
 */
export async function generateCommitMessage(rootPath: string): Promise<string> {
  const diff = await getCommitDiff(rootPath);
  if (!diff.trim()) throw new Error('No changes to describe.');
  const message = cleanMessage(await runClaude(PROMPT, diff));
  if (!message) throw new Error('Claude returned an empty message.');
  return message;
}
