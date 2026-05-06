import {
  DeleteParameterCommand,
  GetParametersByPathCommand,
  ParameterType,
  PutParameterCommand,
  type SSMClient,
} from '@aws-sdk/client-ssm';
import { describe, expect, it } from 'vitest';

import { createSsmStore } from './ssm.ts';

type SentCommand = { name: string; input: unknown };

function makeFakeClient(handler: (cmd: { constructor: { name: string }; input: unknown }) => unknown): {
  client: SSMClient;
  sent: SentCommand[];
} {
  const sent: SentCommand[] = [];
  const fake = {
    send(command: Parameters<SSMClient['send']>[0]) {
      sent.push({ name: command.constructor.name, input: command.input });
      return Promise.resolve(handler(command));
    },
  };
  return { client: fake as unknown as SSMClient, sent };
}

const SCOPE = { prefix: '/myorg/myproject', app: 'api', profile: 'production' };

describe('fetchAll', () => {
  it('returns a single-page result as a map', async () => {
    const { client, sent } = makeFakeClient(() => ({
      Parameters: [
        { Name: '/myorg/myproject/api/production/FOO', Value: '1' },
        { Name: '/myorg/myproject/api/production/BAR', Value: 'hello' },
      ],
    }));
    const store = createSsmStore(client);
    const map = await store.fetchAll(SCOPE);

    expect(map.get('FOO')).toBe('1');
    expect(map.get('BAR')).toBe('hello');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('GetParametersByPathCommand');
    expect((sent[0]?.input as { Path: string; WithDecryption: boolean }).Path).toBe('/myorg/myproject/api/production');
    expect((sent[0]?.input as { WithDecryption: boolean }).WithDecryption).toBe(true);
  });

  it('follows NextToken pagination', async () => {
    let call = 0;
    const { client, sent } = makeFakeClient(() => {
      call++;
      if (call === 1) {
        return { Parameters: [{ Name: '/myorg/myproject/api/production/A', Value: '1' }], NextToken: 'page2' };
      }
      return { Parameters: [{ Name: '/myorg/myproject/api/production/B', Value: '2' }] };
    });
    const store = createSsmStore(client);
    const map = await store.fetchAll(SCOPE);

    expect(map.size).toBe(2);
    expect(map.get('A')).toBe('1');
    expect(map.get('B')).toBe('2');
    expect(sent).toHaveLength(2);
    expect((sent[1]?.input as { NextToken?: string }).NextToken).toBe('page2');
  });

  it('returns an empty map for an empty result', async () => {
    const { client } = makeFakeClient(() => ({ Parameters: [] }));
    const store = createSsmStore(client);
    expect((await store.fetchAll(SCOPE)).size).toBe(0);
  });

  it('ignores entries that do not match the scope', async () => {
    const { client } = makeFakeClient(() => ({
      Parameters: [
        { Name: '/myorg/myproject/api/production/OK', Value: '1' },
        { Name: '/myorg/myproject/other/production/SKIP', Value: '2' },
        { Name: '/wrong/prefix/x/y/z', Value: '3' },
        { Name: '/myorg/myproject/api/production/MISSING_VALUE' /* no Value */ },
      ],
    }));
    const store = createSsmStore(client);
    const map = await store.fetchAll(SCOPE);
    expect([...map.keys()]).toEqual(['OK']);
  });
});

describe('put', () => {
  it('calls with SecureString + KeyId + Overwrite + Description', async () => {
    const { client, sent } = makeFakeClient(() => ({}));
    const store = createSsmStore(client);

    await store.put({
      scope: SCOPE,
      key: 'APP_API_BASE_URL',
      value: 'https://api.example.com',
      kmsKeyId: 'alias/parley',
      description: 'pushed-by=foo;sha=abc1234',
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.name).toBe('PutParameterCommand');
    const input = sent[0]?.input as {
      Name: string;
      Value: string;
      Type: string;
      KeyId: string;
      Overwrite: boolean;
      Description: string;
    };
    expect(input.Name).toBe('/myorg/myproject/api/production/APP_API_BASE_URL');
    expect(input.Value).toBe('https://api.example.com');
    expect(input.Type).toBe(ParameterType.SECURE_STRING);
    expect(input.KeyId).toBe('alias/parley');
    expect(input.Overwrite).toBe(true);
    expect(input.Description).toBe('pushed-by=foo;sha=abc1234');
  });
});

describe('putMany', () => {
  it('does not call anything for an empty array', async () => {
    const { client, sent } = makeFakeClient(() => ({}));
    const store = createSsmStore(client);
    await store.putMany([]);
    expect(sent).toHaveLength(0);
  });

  it('respects the concurrency limit', async () => {
    let inflight = 0;
    let peak = 0;
    const deferred: Array<() => void> = [];

    const fake = {
      send() {
        inflight++;
        peak = Math.max(peak, inflight);
        return new Promise<unknown>((resolve) => {
          deferred.push(() => {
            inflight--;
            resolve({});
          });
        });
      },
    };
    const store = createSsmStore(fake as unknown as SSMClient);

    const inputs = Array.from({ length: 10 }, (_, i) => ({
      scope: SCOPE,
      key: `K${i}`,
      value: String(i),
      kmsKeyId: 'alias/x',
    }));

    const promise = store.putMany(inputs, { concurrency: 3 });
    // drain microtasks so workers reach the send call
    await new Promise((r) => setTimeout(r, 0));
    expect(peak).toBe(3);

    while (deferred.length > 0) {
      deferred.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    await promise;
    expect(peak).toBe(3);
  });

  it('pushes every entry', async () => {
    const { client, sent } = makeFakeClient(() => ({}));
    const store = createSsmStore(client);
    const inputs = Array.from({ length: 5 }, (_, i) => ({
      scope: SCOPE,
      key: `K${i}`,
      value: String(i),
      kmsKeyId: 'alias/x',
    }));
    await store.putMany(inputs, { concurrency: 2 });
    expect(sent).toHaveLength(5);
    expect(new Set(sent.map((s) => (s.input as { Name: string }).Name))).toEqual(
      new Set(inputs.map((i) => `/myorg/myproject/api/production/${i.key}`)),
    );
  });
});

describe('delete', () => {
  it('sends DeleteParameterCommand', async () => {
    const { client, sent } = makeFakeClient(() => ({}));
    const store = createSsmStore(client);
    await store.delete({ scope: SCOPE, key: 'OLD_KEY' });
    expect(sent[0]?.name).toBe('DeleteParameterCommand');
    expect((sent[0]?.input as { Name: string }).Name).toBe('/myorg/myproject/api/production/OLD_KEY');
  });
});

describe('command instance creation', () => {
  it('imports SDK classes correctly', () => {
    expect(new GetParametersByPathCommand({ Path: '/' }).constructor.name).toBe('GetParametersByPathCommand');
    expect(new PutParameterCommand({ Name: '/x', Value: 'v' }).constructor.name).toBe('PutParameterCommand');
    expect(new DeleteParameterCommand({ Name: '/x' }).constructor.name).toBe('DeleteParameterCommand');
  });
});
