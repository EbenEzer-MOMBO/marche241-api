type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const resolveLevel = (): LogLevel => {
  const configured = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (configured && configured in LEVEL_WEIGHT) {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const shouldLog = (level: LogLevel): boolean =>
  LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[resolveLevel()];

const formatArgs = (args: unknown[]): unknown[] => args;

export const logger = {
  error: (...args: unknown[]): void => {
    if (shouldLog('error')) {
      console.error(...formatArgs(args));
    }
  },
  warn: (...args: unknown[]): void => {
    if (shouldLog('warn')) {
      console.warn(...formatArgs(args));
    }
  },
  info: (...args: unknown[]): void => {
    if (shouldLog('info')) {
      console.log(...formatArgs(args));
    }
  },
  debug: (...args: unknown[]): void => {
    if (shouldLog('debug')) {
      console.log(...formatArgs(args));
    }
  }
};
