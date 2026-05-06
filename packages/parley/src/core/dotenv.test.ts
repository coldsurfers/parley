import { describe, expect, it } from 'vitest';

import { chooseQuote, DotenvParseError, fromMap, merge, parse, serialize, serializeValue, toMap } from './dotenv.ts';

describe('parse', () => {
  it('simple KEY=value line', () => {
    expect(parse('FOO=bar')).toEqual([{ type: 'entry', key: 'FOO', value: 'bar', quote: 'none' }]);
  });

  it('preserves comments, blank lines, and entry order', () => {
    const input = ['# header', '', 'FOO=1', '', '# section', 'BAR=2'].join('\n');
    expect(parse(input)).toEqual([
      { type: 'comment', text: '# header' },
      { type: 'blank' },
      { type: 'entry', key: 'FOO', value: '1', quote: 'none' },
      { type: 'blank' },
      { type: 'comment', text: '# section' },
      { type: 'entry', key: 'BAR', value: '2', quote: 'none' },
    ]);
  });

  it('normalizes CRLF to LF', () => {
    expect(parse('FOO=1\r\nBAR=2\r\n')).toEqual([
      { type: 'entry', key: 'FOO', value: '1', quote: 'none' },
      { type: 'entry', key: 'BAR', value: '2', quote: 'none' },
    ]);
  });

  it('trims surrounding whitespace from unquoted values', () => {
    expect(parse('FOO=  hello world  ')).toEqual([{ type: 'entry', key: 'FOO', value: 'hello world', quote: 'none' }]);
  });

  it('double-quotes interpret escape sequences', () => {
    expect(parse(String.raw`FOO="line1\nline2\t\"q\"\\"`)).toEqual([
      { type: 'entry', key: 'FOO', value: 'line1\nline2\t"q"\\', quote: 'double' },
    ]);
  });

  it('double-quotes support multiline', () => {
    const input = 'FOO="line1\nline2\nline3"';
    expect(parse(input)).toEqual([{ type: 'entry', key: 'FOO', value: 'line1\nline2\nline3', quote: 'double' }]);
  });

  it('single-quotes are literal (no escapes)', () => {
    expect(parse(String.raw`FOO='no\nescape'`)).toEqual([
      { type: 'entry', key: 'FOO', value: String.raw`no\nescape`, quote: 'single' },
    ]);
  });

  it('errors on unclosed double-quote', () => {
    expect(() => parse('FOO="unclosed')).toThrow(DotenvParseError);
  });

  it('errors on unclosed single-quote', () => {
    expect(() => parse("FOO='unclosed")).toThrow(DotenvParseError);
  });

  it('errors on invalid line', () => {
    expect(() => parse('not a key value pair')).toThrow(DotenvParseError);
  });

  it('allows empty value KEY=', () => {
    expect(parse('FOO=')).toEqual([{ type: 'entry', key: 'FOO', value: '', quote: 'none' }]);
  });
});

describe('toMap', () => {
  it('last value wins (duplicate keys)', () => {
    const lines = parse('FOO=1\nFOO=2');
    expect(toMap(lines).get('FOO')).toBe('2');
  });
});

describe('chooseQuote', () => {
  it('no quotes for empty value or plain alphanumeric', () => {
    expect(chooseQuote('')).toBe('none');
    expect(chooseQuote('plain123')).toBe('none');
    expect(chooseQuote('a.b-c_d')).toBe('none');
  });

  it('double-quotes for whitespace, special chars, or newlines', () => {
    expect(chooseQuote('has space')).toBe('double');
    expect(chooseQuote(' leading')).toBe('double');
    expect(chooseQuote('trailing ')).toBe('double');
    expect(chooseQuote('with#hash')).toBe('double');
    expect(chooseQuote('with=eq')).toBe('double');
    expect(chooseQuote('with$dollar')).toBe('double');
    expect(chooseQuote('multi\nline')).toBe('double');
    expect(chooseQuote('has"quote')).toBe('double');
  });
});

describe('serializeValue', () => {
  it('no quotes pass through unchanged', () => {
    expect(serializeValue('plain', 'none')).toBe('plain');
  });

  it('double-quote escapes', () => {
    expect(serializeValue('a\nb"c\\d\te', 'double')).toBe(String.raw`"a\nb\"c\\d\te"`);
  });

  it('single-quote is literal but rejects single-quote/newline', () => {
    expect(serializeValue('plain', 'single')).toBe("'plain'");
    expect(() => serializeValue("with'quote", 'single')).toThrow();
    expect(() => serializeValue('multi\nline', 'single')).toThrow();
  });
});

describe('serialize -> parse roundtrip', () => {
  it('preserves comments, blank lines, and order (snapshot)', () => {
    const input = [
      '# header',
      '',
      'PLAIN=hello',
      'WITH_SPACE="hello world"',
      'WITH_HASH="a#b"',
      '',
      '# section',
      'EMPTY=',
      'MULTILINE="line1\nline2"',
      'ESCAPED="quote=\\" backslash=\\\\"',
      "LITERAL='no$expand'",
      '',
    ].join('\n');
    const lines = parse(input);
    const out = serialize(lines);
    expect(out).toMatchInlineSnapshot(`
      "# header

      PLAIN=hello
      WITH_SPACE="hello world"
      WITH_HASH="a#b"

      # section
      EMPTY=
      MULTILINE="line1\\nline2"
      ESCAPED="quote=\\" backslash=\\\\"
      LITERAL='no$expand'
      "
    `);
    // second roundtrip must be identical (stability)
    expect(serialize(parse(out))).toBe(out);
  });

  it('reparsing after add/update yields the same map', () => {
    const lines = parse('FOO=1\nBAR=hello world\nBAZ=multi\\n');
    const map = toMap(lines);
    const reparsed = toMap(parse(serialize(lines)));
    expect(reparsed).toEqual(map);
  });
});

describe('fromMap', () => {
  it('converts map entries to lines and infers quote', () => {
    const lines = fromMap({ PLAIN: 'a', WITH_SPACE: 'a b', MULTI: 'a\nb' });
    expect(lines).toEqual([
      { type: 'entry', key: 'PLAIN', value: 'a', quote: 'none' },
      { type: 'entry', key: 'WITH_SPACE', value: 'a b', quote: 'double' },
      { type: 'entry', key: 'MULTI', value: 'a\nb', quote: 'double' },
    ]);
  });

  it('rejects invalid keys', () => {
    expect(() => fromMap({ '1BAD': 'x' })).toThrow();
    expect(() => fromMap({ 'BAD-KEY': 'x' })).toThrow();
  });
});

describe('merge', () => {
  const local = parse(['# header', '', 'FOO=old', 'BAR=keep'].join('\n'));

  it('updates existing keys and appends new keys at the end', () => {
    const merged = merge(
      local,
      new Map([
        ['FOO', 'new'],
        ['BAR', 'keep'],
        ['BAZ', 'added'],
      ]),
    );
    expect(serialize(merged)).toMatchInlineSnapshot(`
      "# header

      FOO=new
      BAR=keep

      BAZ=added
      "
    `);
  });

  it('keeps lines untouched when value is unchanged (same reference)', () => {
    const merged = merge(
      local,
      new Map([
        ['FOO', 'old'],
        ['BAR', 'keep'],
      ]),
    );
    const fooBefore = local.find((l) => l.type === 'entry' && l.key === 'FOO');
    const fooAfter = merged.find((l) => l.type === 'entry' && (l as { key: string }).key === 'FOO');
    expect(fooAfter).toBe(fooBefore);
  });

  it('removeMissing=false keeps local-only keys (default)', () => {
    const merged = merge(local, new Map([['FOO', 'new']]));
    const keys = merged.filter((l) => l.type === 'entry').map((l) => (l as { key: string }).key);
    expect(keys).toEqual(['FOO', 'BAR']);
  });

  it('removeMissing=true removes local-only keys', () => {
    const merged = merge(local, new Map([['FOO', 'new']]), { removeMissing: true });
    const keys = merged.filter((l) => l.type === 'entry').map((l) => (l as { key: string }).key);
    expect(keys).toEqual(['FOO']);
  });

  it('does not append a trailing blank line when no new keys', () => {
    const merged = merge(
      local,
      new Map([
        ['FOO', 'new'],
        ['BAR', 'keep'],
      ]),
    );
    expect(serialize(merged).endsWith('\n\n')).toBe(false);
  });
});
