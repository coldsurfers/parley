export type DiffStatus = 'added' | 'updated' | 'removed' | 'unchanged';

export type DiffEntry = { key: string; status: DiffStatus };

export type DiffResult = {
  entries: DiffEntry[];
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
};

/**
 * Compare `remote` against `local`.
 *
 * - `added`: keys only in local (must be created on push)
 * - `updated`: keys present in both but with different values
 * - `removed`: keys only in remote (push does not auto-delete; the caller decides whether to prune)
 * - `unchanged`: keys with identical values
 *
 * Values are compared with `===`. Both maps hold plaintext at this point, so hash comparison is unnecessary.
 */
export function diffMaps(local: Map<string, string>, remote: Map<string, string>): DiffResult {
  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];
  const entries: DiffEntry[] = [];

  for (const [key, value] of local) {
    if (!remote.has(key)) {
      added.push(key);
      entries.push({ key, status: 'added' });
      continue;
    }
    if (remote.get(key) === value) {
      unchanged.push(key);
      entries.push({ key, status: 'unchanged' });
    } else {
      updated.push(key);
      entries.push({ key, status: 'updated' });
    }
  }
  for (const key of remote.keys()) {
    if (!local.has(key)) {
      removed.push(key);
      entries.push({ key, status: 'removed' });
    }
  }

  return { entries, added, updated, removed, unchanged };
}

export function hasChanges(d: DiffResult): boolean {
  return d.added.length > 0 || d.updated.length > 0 || d.removed.length > 0;
}
