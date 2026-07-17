#!/usr/bin/env node
/* global console, process */
import { fileURLToPath } from "node:url";

import { runCommand } from "./compose-dev-seed.mjs";

const defaultRedisHostPort = 6379;
const maxRedisHostPort = 65_535;

const usage = `Usage:
  npm run restore:redis:local -- <backup-artifact.json>

Environment:
  REDIS_URL         Optional explicit local Redis connection URL.
  REDIS_HOST_PORT  Optional Docker Compose Redis host port. Defaults to 6379.

Behavior:
  Calls npm run restore:redis with REDIS_URL set for local Docker Compose Redis.
`;

const parseRedisHostPort = (value) => {
  const redisHostPort = Number(value);

  if (
    !Number.isInteger(redisHostPort) ||
    redisHostPort < 1 ||
    redisHostPort > maxRedisHostPort
  ) {
    throw new Error(
      `REDIS_HOST_PORT must be an integer between 1 and ${maxRedisHostPort}.`,
    );
  }

  return redisHostPort;
};

export const resolveLocalRedisUrl = (env = process.env) => {
  const redisUrl = env.REDIS_URL?.trim();

  if (redisUrl) {
    return redisUrl;
  }

  const redisHostPort = parseRedisHostPort(
    env.REDIS_HOST_PORT?.trim() || `${defaultRedisHostPort}`,
  );

  return `redis://localhost:${redisHostPort}`;
};

export const runLocalRedisRestore = async ({
  argv = process.argv.slice(2),
  env = process.env,
  commandRunner = runCommand,
  logger = console,
} = {}) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    logger.log(usage);
    return 0;
  }

  const redisUrl = resolveLocalRedisUrl(env);
  logger.log(`Restoring Redis vote totals into ${redisUrl}.`);

  return commandRunner("npm", ["run", "restore:redis", "--", ...argv], {
    env: {
      ...env,
      REDIS_URL: redisUrl,
    },
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runLocalRedisRestore()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
