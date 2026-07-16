#!/usr/bin/env node
/* global AbortController, console, process, setTimeout, clearTimeout */
import { spawn } from "node:child_process";

const envNames = {
  enabled: "REDIS_BACKUP_SIDECAR_ENABLED",
  cadenceSeconds: "REDIS_BACKUP_CADENCE_SECONDS",
  dryRun: "REDIS_BACKUP_DRY_RUN",
  runOnce: "REDIS_BACKUP_SIDECAR_RUN_ONCE",
};

const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);

const parseBoolean = ({ env, name, defaultValue }) => {
  const value = env[name]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  if (truthyValues.has(value)) {
    return true;
  }

  if (falsyValues.has(value)) {
    return false;
  }

  throw new Error(`${name} must be one of: true, false, 1, 0, yes, no, on, off.`);
};

const parseCadenceMs = (env) => {
  const value = env[envNames.cadenceSeconds]?.trim() || "86400";
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${envNames.cadenceSeconds} must be a positive integer.`);
  }

  return parsed * 1000;
};

const sleep = (ms, { signal }) =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });

const runBackup = ({ dryRun, signal }) =>
  new Promise((resolve, reject) => {
    const mode = dryRun ? "--dry-run" : "--push";
    const child = spawn("npm", ["run", "backup:redis", "--", mode], {
      env: process.env,
      stdio: "inherit",
    });

    const abort = () => {
      child.kill("SIGTERM");
    };

    signal.addEventListener("abort", abort, { once: true });

    child.once("error", (error) => {
      signal.removeEventListener("abort", abort);
      reject(error);
    });

    child.once("exit", (code, signalName) => {
      signal.removeEventListener("abort", abort);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Redis backup command failed with ${signalName ?? `exit code ${code}`}.`,
        ),
      );
    });
  });

const main = async () => {
  const enabled = parseBoolean({
    env: process.env,
    name: envNames.enabled,
    defaultValue: false,
  });

  if (!enabled) {
    console.log(
      `${envNames.enabled} is not enabled; Redis backup sidecar is idle.`,
    );
    return;
  }

  const dryRun = parseBoolean({
    env: process.env,
    name: envNames.dryRun,
    defaultValue: true,
  });
  const runOnce = parseBoolean({
    env: process.env,
    name: envNames.runOnce,
    defaultValue: false,
  });
  const cadenceMs = parseCadenceMs(process.env);
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  do {
    await runBackup({ dryRun, signal: controller.signal });

    if (runOnce || controller.signal.aborted) {
      break;
    }

    await sleep(cadenceMs, { signal: controller.signal });
  } while (!controller.signal.aborted);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
