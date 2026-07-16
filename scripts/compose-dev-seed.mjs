#!/usr/bin/env node
/* global console, process, setTimeout */
import { spawn } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";

const defaultRedisHostPort = 6379;
const maxRedisHostPort = 65_535;
const redisHost = "127.0.0.1";
const seedAttempts = 10;
const seedRetryDelayMs = 1_000;

const toRedisUrl = (redisHostPort) => `redis://localhost:${redisHostPort}`;

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

export const isLocalPortAvailable = (redisHostPort) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(redisHostPort, redisHost);
  });

export const resolveRedisEndpoint = async ({
  env = process.env,
  isPortAvailable = isLocalPortAvailable,
  commandName = "npm run compose:dev:seed",
} = {}) => {
  const explicitRedisHostPort = env.REDIS_HOST_PORT?.trim();
  const requestedRedisHostPort = parseRedisHostPort(
    explicitRedisHostPort || `${defaultRedisHostPort}`,
  );

  if (await isPortAvailable(requestedRedisHostPort)) {
    return {
      redisHostPort: requestedRedisHostPort,
      redisUrl: toRedisUrl(requestedRedisHostPort),
    };
  }

  if (explicitRedisHostPort) {
    throw new Error(
      `REDIS_HOST_PORT=${requestedRedisHostPort} is already in use on ${redisHost}. Choose another free port and rerun ${commandName}.`,
    );
  }

  for (
    let redisHostPort = requestedRedisHostPort + 1;
    redisHostPort <= maxRedisHostPort;
    redisHostPort += 1
  ) {
    if (await isPortAvailable(redisHostPort)) {
      return {
        redisHostPort,
        redisUrl: toRedisUrl(redisHostPort),
      };
    }
  }

  throw new Error(
    `No available localhost Redis host port found from ${requestedRedisHostPort} to ${maxRedisHostPort}. Set REDIS_HOST_PORT to a free port and rerun ${commandName}.`,
  );
};

export const runCommand = (command, args, options = {}) =>
  new Promise((resolve) => {
    const { onStart, ...spawnOptions } = options;
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
      ...spawnOptions,
    });

    onStart?.(child);

    child.on("error", (error) => {
      console.error(error instanceof Error ? error.message : error);
      resolve(1);
    });

    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });

const sleep = (milliseconds) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

export const seedRedisVotes = async ({
  env = process.env,
  redisUrl,
  commandRunner = runCommand,
  sleeper = sleep,
} = {}) => {
  for (let attempt = 1; attempt <= seedAttempts; attempt += 1) {
    const exitCode = await commandRunner("npm", ["run", "seed:redis:votes"], {
      env: {
        ...env,
        REDIS_URL: redisUrl,
      },
    });

    if (exitCode === 0) {
      return 0;
    }

    if (attempt < seedAttempts) {
      console.log(
        `Redis seed attempt ${attempt} failed; retrying in ${seedRetryDelayMs}ms...`,
      );
      await sleeper(seedRetryDelayMs);
    }
  }

  return 1;
};

export const runComposeDevSeed = async ({
  env = process.env,
  commandRunner = runCommand,
  isPortAvailable = isLocalPortAvailable,
  logger = console,
} = {}) => {
  const { redisHostPort, redisUrl } = await resolveRedisEndpoint({
    env,
    isPortAvailable,
  });
  const childEnv = {
    ...env,
    REDIS_HOST_PORT: `${redisHostPort}`,
  };

  const composeExitCode = await commandRunner(
    "docker",
    ["compose", "up", "-d", "app", "redis"],
    {
      env: childEnv,
    },
  );

  if (composeExitCode !== 0) {
    return composeExitCode;
  }

  logger.log(`Seeding Redis vote totals at ${redisUrl}.`);

  return seedRedisVotes({
    env,
    redisUrl,
    commandRunner,
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runComposeDevSeed()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
