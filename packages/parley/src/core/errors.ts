export class ParleyError extends Error {
  override readonly name: string = 'ParleyError';
}

export class ConfigNotFoundError extends ParleyError {
  override readonly name = 'ConfigNotFoundError';
  constructor(public readonly searchedFrom: string) {
    super(
      `parley.config.ts not found (searched from: ${searchedFrom}).\n` +
        `Run 'parley init' from the repo root to create one.`,
    );
  }
}

export class ConfigValidationError extends ParleyError {
  override readonly name = 'ConfigValidationError';
  constructor(
    public readonly configPath: string,
    public readonly issues: readonly string[],
  ) {
    super(`invalid config file: ${configPath}\n - ${issues.join('\n - ')}`);
  }
}

export class UnknownAppError extends ParleyError {
  override readonly name = 'UnknownAppError';
  constructor(
    public readonly app: string,
    public readonly available: readonly string[],
  ) {
    super(`unknown app '${app}'. Available apps: ${available.join(', ') || '(no apps defined in config)'}`);
  }
}

export class UnknownProfileError extends ParleyError {
  override readonly name = 'UnknownProfileError';
  constructor(
    public readonly app: string,
    public readonly profile: string,
    public readonly available: readonly string[],
  ) {
    super(`profile '${profile}' is not defined for '${app}'. Available profiles: ${available.join(', ')}`);
  }
}
