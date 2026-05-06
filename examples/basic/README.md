# @parley-examples/basic

Minimal example showing how to consume the published `@coldsurf/parley` from a single-app project.

This example references the **real npm release** (`^0.1.0`) — not a workspace link — so it mirrors how an end user would adopt parley.

## Run

```bash
# 1. Install
pnpm --filter @parley-examples/basic install

# 2. Copy the example env (or run `pnpm parley pull api development`)
cp .env.example .env.development

# 3. Sanity-check AWS credentials and KMS/IAM access
pnpm --filter @parley-examples/basic parley:doctor

# 4. Run the app with env injected from SSM (no disk writes)
pnpm --filter @parley-examples/basic parley:run
```

## Files

- `parley.config.ts` — single app `api` with `development` / `production` profiles
- `.env.example` — keys to seed your local `.env.<profile>` before the first `push`
- `src/index.ts` — tiny app that asserts required env and logs a masked summary
