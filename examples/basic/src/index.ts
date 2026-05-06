const required = ['DATABASE_URL', 'API_TOKEN'] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[basic-example] missing required env: ${key}`);
    process.exit(1);
  }
}

console.log('[basic-example] booted with env from parley');
console.log(`  LOG_LEVEL = ${process.env.LOG_LEVEL ?? 'info'}`);
console.log(`  DATABASE_URL = ${maskUrl(process.env.DATABASE_URL ?? '')}`);

function maskUrl(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
}
