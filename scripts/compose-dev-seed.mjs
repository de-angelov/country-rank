#!/usr/bin/env node
/* global console, process, setTimeout */
import { spawn } from "node:child_process";

const redisHostPort = process.env.REDIS_HOST_PORT?.trim() || "6379";
const redisUrl = `redis://localhost:${redisHostPort}`;
const seedAttempts = 10;
const seedRetryDelayMs = 1_000;

const runCommand = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: "inherit",
      ...options,
    });

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

const seedRedisVotes = async () => {
  for (let attempt = 1; attempt <= seedAttempts; attempt += 1) {
    const exitCode = await runCommand("npm", ["run", "seed:redis:votes"], {
      env: {
        ...process.env,
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
      await sleep(seedRetryDelayMs);
    }
  }

  return 1;
};

const main = async () => {
  const composeExitCode = await runCommand("docker", [
    "compose",
    "up",
    "-d",
    "app",
    "redis",
  ]);

  if (composeExitCode !== 0) {
    process.exitCode = composeExitCode;
    return;
  }

  console.log(`Seeding Redis vote totals at ${redisUrl}.`);

  const seedExitCode = await seedRedisVotes();
  process.exitCode = seedExitCode;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
