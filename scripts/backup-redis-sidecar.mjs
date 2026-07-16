#!/usr/bin/env node
/* global clearTimeout, console, process, setTimeout */
import { spawn } from "node:child_process";
import { URL, fileURLToPath } from "node:url";

const envNames = {
  enabled: "REDIS_BACKUP_SIDECAR_ENABLED",
  intervalSeconds: "REDIS_BACKUP_SIDECAR_INTERVAL_SECONDS",
  dryRun: "REDIS_BACKUP_SIDECAR_DRY_RUN",
};

const defaultIntervalSeconds = 60 * 60 * 24;
const backupScriptPath = fileURLToPath(
  new URL("./backup-redis.mjs", import.meta.url),
);

const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);

const normalizeBoolean = (value) => value?.trim().toLowerCase();

const isEnabled = (env) =>
  truthyValues.has(normalizeBoolean(env[envNames.enabled]));

const isDryRun = (env) => {
  const value = normalizeBoolean(env[envNames.dryRun]);

  if (!value) {
    return true;
  }

  if (truthyValues.has(value)) {
    return true;
  }

  if (falsyValues.has(value)) {
    return false;
  }

  throw new Error(`${envNames.dryRun} must be a boolean value.`);
};

const parseIntervalMilliseconds = (env) => {
  const rawValue = env[envNames.intervalSeconds]?.trim();

  if (!rawValue) {
    return defaultIntervalSeconds * 1000;
  }

  const parsed = Number(rawValue);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${envNames.intervalSeconds} must be a positive integer.`);
  }

  return parsed * 1000;
};

const runBackup = ({ dryRun }) =>
  new Promise((resolve) => {
    const modeArgument = dryRun ? "--dry-run" : "--push";
    const child = spawn(process.execPath, [backupScriptPath, modeArgument], {
      stdio: "inherit",
    });

    child.on("error", (error) => {
      console.error(
        `Redis backup sidecar failed to start backup: ${error.message}`,
      );
      resolve(false);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      console.error(`Redis backup sidecar backup failed with ${reason}.`);
      resolve(false);
    });
  });

const main = async () => {
  if (!isEnabled(process.env)) {
    console.log(
      `${envNames.enabled} is not enabled; Redis backup sidecar is inert.`,
    );
    return;
  }

  const intervalMilliseconds = parseIntervalMilliseconds(process.env);
  const dryRun = isDryRun(process.env);
  let stopping = false;
  let timeout;

  const stop = () => {
    stopping = true;

    if (timeout) {
      clearTimeout(timeout);
    }
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    await runBackup({ dryRun });

    if (stopping) {
      break;
    }

    await new Promise((resolve) => {
      timeout = setTimeout(resolve, intervalMilliseconds);
    });
    timeout = undefined;
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
