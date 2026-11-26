import { execSync } from 'node:child_process';

export interface BuildInfo {
  version: string;
  commit: string;
  changes: string[];
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Version = number of commits on the built branch; the build assigns it, nobody else. */
export function buildInfo(): BuildInfo {
  const count = git('rev-list --count HEAD') || '0';
  const commit = git('rev-parse --short=7 HEAD') || 'lokal';
  const changes = git('log --no-merges --format=%s -n 8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { version: count, commit, changes };
}
