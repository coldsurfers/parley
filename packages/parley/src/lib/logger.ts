import pc from 'picocolors';

export type Logger = {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  dim(msg: string): void;
  plain(msg: string): void;
};

export const consoleLogger: Logger = {
  info: (m) => console.log(`${pc.cyan('•')} ${m}`),
  success: (m) => console.log(`${pc.green('✓')} ${m}`),
  warn: (m) => console.warn(`${pc.yellow('!')} ${m}`),
  error: (m) => console.error(`${pc.red('✗')} ${m}`),
  dim: (m) => console.log(pc.dim(m)),
  plain: (m) => console.log(m),
};

export const silentLogger: Logger = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  dim: () => {},
  plain: () => {},
};
