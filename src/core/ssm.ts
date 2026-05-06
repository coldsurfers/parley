import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParametersByPathCommand,
  type GetParametersByPathCommandOutput,
  ParameterNotFound,
  ParameterType,
  PutParameterCommand,
  type SSMClient,
} from '@aws-sdk/client-ssm';

import { parseSsmPath, ssmPathFor, ssmPrefixFor } from './paths.ts';

export type ParameterScope = { prefix: string; app: string; profile: string };

export type PutInput = {
  scope: ParameterScope;
  key: string;
  value: string;
  kmsKeyId: string;
  /** SSM Parameter description metadata. Max 1024 chars. Example: "pushed-by=foo;sha=abc1234;at=2026-05-06T..." */
  description?: string;
};

export type SsmStore = {
  fetchAll(scope: ParameterScope): Promise<Map<string, string>>;
  /** Get a single key. Returns null if missing. */
  getOne(args: { scope: ParameterScope; key: string }): Promise<string | null>;
  put(input: PutInput): Promise<void>;
  putMany(inputs: readonly PutInput[], opts?: { concurrency?: number }): Promise<void>;
  delete(args: { scope: ParameterScope; key: string }): Promise<void>;
};

const MAX_PAGE_SIZE = 10;
const DEFAULT_CONCURRENCY = 5;

export function createSsmStore(client: SSMClient): SsmStore {
  async function putOne(input: PutInput): Promise<void> {
    await client.send(
      new PutParameterCommand({
        Name: ssmPathFor({ ...input.scope, key: input.key }),
        Value: input.value,
        Type: ParameterType.SECURE_STRING,
        KeyId: input.kmsKeyId,
        Overwrite: true,
        Description: input.description,
      }),
    );
  }

  return {
    async fetchAll(scope) {
      const path = ssmPrefixFor(scope);
      const out = new Map<string, string>();
      let nextToken: string | undefined;

      do {
        const res: GetParametersByPathCommandOutput = await client.send(
          new GetParametersByPathCommand({
            Path: path,
            Recursive: false,
            WithDecryption: true,
            MaxResults: MAX_PAGE_SIZE,
            NextToken: nextToken,
          }),
        );

        for (const p of res.Parameters ?? []) {
          if (!p.Name || p.Value === undefined) continue;
          const parsed = parseSsmPath(scope.prefix, p.Name);
          if (!parsed) continue;
          if (parsed.app !== scope.app || parsed.profile !== scope.profile) continue;
          out.set(parsed.key, p.Value);
        }

        nextToken = res.NextToken;
      } while (nextToken);

      return out;
    },

    async getOne({ scope, key }) {
      try {
        const res = await client.send(
          new GetParameterCommand({ Name: ssmPathFor({ ...scope, key }), WithDecryption: true }),
        );
        return res.Parameter?.Value ?? null;
      } catch (err) {
        if (err instanceof ParameterNotFound) return null;
        throw err;
      }
    },

    put: putOne,

    async putMany(inputs, opts) {
      if (inputs.length === 0) return;
      const concurrency = Math.max(1, opts?.concurrency ?? DEFAULT_CONCURRENCY);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= inputs.length) return;
          // biome-ignore lint/style/noNonNullAssertion: only enters when cursor < length
          await putOne(inputs[idx]!);
        }
      });
      await Promise.all(workers);
    },

    async delete({ scope, key }) {
      await client.send(new DeleteParameterCommand({ Name: ssmPathFor({ ...scope, key }) }));
    },
  };
}
