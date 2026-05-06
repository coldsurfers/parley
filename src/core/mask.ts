import { createHash } from 'node:crypto';

/** Short SHA-256 hash (first 8 chars) for value comparison and display. */
export function valueFingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
}

/** Display mask. Reveals only length and the first/last char (fully masked under 4 chars). */
export function maskValue(value: string): string {
  if (value.length === 0) return '<empty>';
  if (value.length < 4) return '*'.repeat(value.length);
  return `${value[0]}${'*'.repeat(value.length - 2)}${value[value.length - 1]}`;
}
