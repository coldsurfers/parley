# parley

> Git-style env sync between your machine and AWS Parameter Store + KMS.
> A self-hosted alternative to Doppler/Infisical for AWS-native teams.

`parley` treats environment variables like source code: `push`, `pull`, `diff`. The store is your own AWS account (SSM Parameter Store, encrypted by KMS). No SaaS subscription, no third-party vault. Works great in TS monorepos.

## Why parley

- **AWS-native, IAM-bound** — secrets live in your account; access is governed by your existing IAM/SSO policies.
- **Git-style workflow** — `parley push` / `pull` / `diff` map cleanly to how you already think.
- **Monorepo-aware** — first-class `apps × profiles` matrix in a typed `parley.config.ts`.
- **Ephemeral injection** — `parley run --app api --profile production -- node server.js` (no disk writes).
- **CI-friendly** — `parley diff --exit-code` fails the build when local and remote drift.

## Install

```bash
pnpm add -D @coldsurf/parley
# or
npm i -D @coldsurf/parley
```

## Quickstart

```bash
# 1. Generate a parley.config.ts at repo root
pnpm parley init

# 2. Edit prefix / region / kmsKeyId / apps mappings
# 3. Validate AWS credentials and KMS/IAM
pnpm parley doctor

# 4. Push your local .env.<profile> → SSM
pnpm parley push api production

# 5. Pull from SSM → local .env.<profile>
pnpm parley pull api production
```

## Commands

| Command | Description |
| --- | --- |
| `init` | Scaffold `parley.config.ts`, sanity-check AWS credentials |
| `push` | Local `.env.<profile>` → SSM (changes only) |
| `pull` | SSM → local `.env.<profile>` |
| `diff` | Compare keys between local and remote (values hashed) |
| `list` | List SSM keys for an app/profile |
| `get` / `set` / `unset` | Single-key operations |
| `run -- <cmd>` | Inject env from SSM and exec a command (no disk writes) |
| `sync push|pull` | Bulk push/pull across multiple apps/profiles |
| `doctor` | Diagnose credentials, SSM access, KMS access, mappings |

## Configuration

```ts
// parley.config.ts
import { defineConfig } from '@coldsurf/parley/config';

export default defineConfig({
  region: 'ap-northeast-2',
  prefix: '/myorg/myproject',
  kmsKeyId: 'alias/parley',
  apps: {
    api: { path: 'apps/api', profiles: ['development', 'staging', 'production'] },
    web: { path: 'apps/web', profiles: ['development', 'production'] },
  },
});
```

## Comparison

| | parley | chamber | Doppler / Infisical | sops |
| --- | --- | --- | --- | --- |
| Backend | AWS SSM + KMS | AWS SSM + KMS | SaaS | File (any backend) |
| Self-hosted | ✅ | ✅ | Paid plan | ✅ |
| TS DX | ✅ | ❌ (Go) | ✅ | ❌ |
| `push`/`pull`/`diff` | ✅ | partial | ✅ | partial |
| Monorepo apps × profiles | ✅ | ❌ | partial | ❌ |

## License

MIT © COLDSURF
