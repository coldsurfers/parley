import { execFileSync } from 'node:child_process';

export type GitMeta = { user: string; sha: string; at: string };

function safeExec(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Current git user / short SHA / call time. Falls back to 'unknown' / 'nogit' on failure. */
export function gitMeta(cwd: string): GitMeta {
  const user = safeExec(['config', 'user.email'], cwd) || safeExec(['config', 'user.name'], cwd) || 'unknown';
  const sha = safeExec(['rev-parse', '--short=8', 'HEAD'], cwd) || 'nogit';
  return { user, sha, at: new Date().toISOString() };
}

/** Metadata string for SSM Description (capped at 1024 chars, safely truncated). */
export function buildDescription(meta: GitMeta): string {
  const raw = `pushed-by=${meta.user};sha=${meta.sha};at=${meta.at}`;
  return raw.length <= 1024 ? raw : raw.slice(0, 1024);
}
