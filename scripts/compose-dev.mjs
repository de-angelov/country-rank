#!/usr/bin/env node
/* global console, process */
import { fileURLToPath } from "node:url";

import {
  isLocalPortAvailable,
  resolveRedisEndpoint,
  resolveAppUrl,
  resolveComposeEnv,
  runCommand,
} from "./compose-dev-seed.mjs";

export const runComposeDev = async ({
  env = process.env,
  dotEnv,
  commandRunner = runCommand,
  isPortAvailable = isLocalPortAvailable,
  logger = console,
} = {}) => {
  const composeEnv = resolveComposeEnv({ env, dotEnv });
  const { redisHostPort, redisUrl } = await resolveRedisEndpoint({
    env: composeEnv,
    isPortAvailable,
    commandName: "npm run compose:dev",
  });
  const childEnv = {
    ...composeEnv,
    REDIS_HOST_PORT: `${redisHostPort}`,
  };
  const appUrl = resolveAppUrl(composeEnv);
  let didPrintEndpoints = false;
  const printEndpoints = () => {
    if (didPrintEndpoints) {
      return;
    }

    didPrintEndpoints = true;
    logger.log(`Compose dev app: ${appUrl}`);
    logger.log(`Compose dev Redis: ${redisUrl}`);
  };

  return commandRunner("docker", ["compose", "up", "app-dev", "redis"], {
    env: childEnv,
    onStart: printEndpoints,
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runComposeDev()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
