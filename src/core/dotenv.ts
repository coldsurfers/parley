/**
 * .env parser/serializer.
 *
 * The roundtrip (parse -> serialize) must be stable. The goal is to preserve user-written
 * comments, blank lines, and key order across pulls so git diffs stay quiet.
 *
 * Supported syntax:
 * - `KEY=value` (unquoted, value runs to end of line; surrounding whitespace is trimmed)
 * - `KEY="value"` (double-quoted, multiline allowed, \n/\r/\t/\"/\\ escapes)
 * - `KEY='value'` (single-quoted, literal, no multiline)
 * - `# comment` lines / blank lines
 *
 * Explicitly unsupported (kept simple on purpose):
 * - `export KEY=value` prefix
 * - inline trailing comments (`KEY=value # cmt`)
 * - variable interpolation (`KEY=${OTHER}`)
 */

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENTRY_LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

export type QuoteKind = 'double' | 'single' | 'none';

export type EntryLine = { type: 'entry'; key: string; value: string; quote: QuoteKind };
export type CommentLine = { type: 'comment'; text: string };
export type BlankLine = { type: 'blank' };
export type Line = EntryLine | CommentLine | BlankLine;

export class DotenvParseError extends Error {
  override readonly name = 'DotenvParseError';
  constructor(
    message: string,
    public readonly lineNumber: number,
  ) {
    super(`${message} (line ${lineNumber})`);
  }
}

export function parse(content: string): Line[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const rows = normalized.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();

  const out: Line[] = [];
  let i = 0;
  while (i < rows.length) {
    const lineNumber = i + 1;
    const row = rows[i] ?? '';

    if (row.trim() === '') {
      out.push({ type: 'blank' });
      i++;
      continue;
    }
    if (/^\s*#/.test(row)) {
      out.push({ type: 'comment', text: row });
      i++;
      continue;
    }

    const match = ENTRY_LINE_RE.exec(row);
    if (!match) throw new DotenvParseError(`could not parse line: ${row}`, lineNumber);

    const [, rawKey, rawValueAfterEq] = match;
    const key = rawKey ?? '';
    const valueRaw = rawValueAfterEq ?? '';
    const trimmedHead = valueRaw.replace(/^[ \t]+/, '');

    if (trimmedHead.startsWith('"')) {
      let acc = trimmedHead.slice(1);
      while (true) {
        const closeIdx = findUnescapedDoubleQuote(acc);
        if (closeIdx >= 0) {
          const enclosed = acc.slice(0, closeIdx);
          out.push({ type: 'entry', key, value: unescapeDouble(enclosed), quote: 'double' });
          break;
        }
        i++;
        if (i >= rows.length) throw new DotenvParseError(`unclosed double-quote: ${key}`, lineNumber);
        acc += `\n${rows[i] ?? ''}`;
      }
      i++;
      continue;
    }

    if (trimmedHead.startsWith("'")) {
      const closeIdx = trimmedHead.indexOf("'", 1);
      if (closeIdx < 0) throw new DotenvParseError(`unclosed single-quote: ${key}`, lineNumber);
      out.push({ type: 'entry', key, value: trimmedHead.slice(1, closeIdx), quote: 'single' });
      i++;
      continue;
    }

    out.push({ type: 'entry', key, value: trimmedHead.replace(/[ \t]+$/, ''), quote: 'none' });
    i++;
  }

  return out;
}

function findUnescapedDoubleQuote(s: string): number {
  for (let j = 0; j < s.length; j++) {
    if (s[j] === '\\') {
      j++;
      continue;
    }
    if (s[j] === '"') return j;
  }
  return -1;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => {
    switch (c) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '"':
        return '"';
      case '\\':
        return '\\';
      case '$':
        return '$';
      default:
        return c;
    }
  });
}

export function toMap(lines: readonly Line[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of lines) {
    if (line.type === 'entry') m.set(line.key, line.value);
  }
  return m;
}

/**
 * Pick a safe quoting style. Prefer no quotes when possible.
 * - empty value: no quotes
 * - contains multiline/control chars/`"`/`\\`: double-quote (escapes needed)
 * - leading/trailing whitespace, or contains `#`, `=`, `$`, ` `: double-quote (no escapes needed, but disambiguates)
 * - otherwise: no quotes
 */
export function chooseQuote(value: string): QuoteKind {
  if (value === '') return 'none';
  if (/[\n\r\t"\\]/.test(value)) return 'double';
  if (/^\s|\s$|[#=$ ]/.test(value)) return 'double';
  return 'none';
}

export function serializeValue(value: string, quote: QuoteKind): string {
  if (quote === 'none') return value;
  if (quote === 'single') {
    if (value.includes("'") || /[\n\r]/.test(value)) {
      throw new Error('single-quoted values cannot contain a single-quote or newline');
    }
    return `'${value}'`;
  }
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

export function serialize(lines: readonly Line[]): string {
  const out: string[] = [];
  for (const line of lines) {
    switch (line.type) {
      case 'blank':
        out.push('');
        break;
      case 'comment':
        out.push(line.text);
        break;
      case 'entry': {
        const quote = line.quote === 'none' ? chooseQuote(line.value) : line.quote;
        out.push(`${line.key}=${serializeValue(line.value, quote)}`);
        break;
      }
    }
  }
  return `${out.join('\n')}\n`;
}

export function fromMap(entries: Map<string, string> | Record<string, string>): Line[] {
  const iterable: Iterable<[string, string]> = entries instanceof Map ? entries : Object.entries(entries);
  const lines: Line[] = [];
  for (const [key, value] of iterable) {
    if (!KEY_RE.test(key)) throw new Error(`invalid env var key: '${key}'`);
    lines.push({ type: 'entry', key, value, quote: chooseQuote(value) });
  }
  return lines;
}

export type MergeOptions = {
  /** Delete local keys missing from remote. Defaults to false (for replace mode, callers should use fromMap). */
  removeMissing?: boolean;
};

/**
 * Apply remote values while preserving local line structure (comments, blank lines, order).
 * - Same key: keep the line if the value is unchanged; otherwise replace with the new value (quote re-picked via chooseQuote)
 * - Remote-only keys: appended after a blank line at the end
 * - Local keys missing from remote: removed if removeMissing=true, otherwise kept
 */
export function merge(local: readonly Line[], remote: Map<string, string>, opts: MergeOptions = {}): Line[] {
  const removeMissing = opts.removeMissing ?? false;
  const remaining = new Map(remote);
  const out: Line[] = [];

  for (const line of local) {
    if (line.type !== 'entry') {
      out.push(line);
      continue;
    }
    if (remaining.has(line.key)) {
      const newValue = remaining.get(line.key) ?? '';
      remaining.delete(line.key);
      if (newValue === line.value) {
        out.push(line);
      } else {
        out.push({ type: 'entry', key: line.key, value: newValue, quote: chooseQuote(newValue) });
      }
      continue;
    }
    if (!removeMissing) out.push(line);
  }

  if (remaining.size > 0) {
    const last = out[out.length - 1];
    if (last && last.type !== 'blank') out.push({ type: 'blank' });
    for (const [key, value] of remaining) {
      out.push({ type: 'entry', key, value, quote: chooseQuote(value) });
    }
  }

  return out;
}
