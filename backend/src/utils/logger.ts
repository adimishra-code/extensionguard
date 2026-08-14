import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  base: {
    service: 'extension-guard-backend',
  },
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}