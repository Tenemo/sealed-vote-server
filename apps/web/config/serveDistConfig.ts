import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultHost = '0.0.0.0';
const defaultPort = 3000;
const maxPort = 65_535;

export const distDirectory = path.resolve(currentDirectory, '..', 'dist');
const builtIndexPath = path.resolve(distDirectory, 'index.html');

const parsePort = (value: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new TypeError('PORT must be a valid integer.');
  }

  const port = Number.parseInt(value, 10);

  if (port < 1 || port > maxPort) {
    throw new RangeError(`PORT must be between 1 and ${maxPort}.`);
  }

  return port;
};

export const resolveServeDistOptions = (
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): {
  distDirectory: string;
  host: string;
  port: number;
} => {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;

  const { values } = parseArgs({
    args: normalizedArgs,
    options: {
      host: {
        type: 'string',
      },
      port: {
        type: 'string',
      },
    },
    allowPositionals: false,
  });

  const host = values.host?.trim() || defaultHost;
  const rawPort = values.port?.trim() || env.PORT?.trim() || `${defaultPort}`;

  return {
    distDirectory,
    host,
    port: parsePort(rawPort),
  };
};

export const assertBuiltDistExists = async (): Promise<void> => {
  try {
    await access(builtIndexPath);
  } catch {
    throw new Error(
      `Missing built frontend artifact at ${builtIndexPath}. Run pnpm --filter @sealed-vote/web build first.`,
    );
  }
};
