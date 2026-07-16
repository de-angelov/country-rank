#!/usr/bin/env node
/* global console, process */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createClient } from "redis";

const redisUrlEnvVar = "REDIS_URL";
const keyPattern = "country:votes:*";
const countryCodePattern = /^[A-Z]{2}$/;

const usage = `Usage:
  REDIS_URL=redis://localhost:6379 npm run restore:redis -- <backup-artifact.json>

Environment:
  REDIS_URL    Redis connection URL.

Behavior:
  Replaces the Redis vote totals for countries present in the backup artifact.
`;

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const voteTotalsKey = (countryCode) => `country:votes:${countryCode}`;

const assertNonNegativeInteger = ({ value, path }) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer.`);
  }
};

export const requireRedisUrl = (env) => {
  const redisUrl = env[redisUrlEnvVar]?.trim();

  if (!redisUrl) {
    throw new Error(`${redisUrlEnvVar} must be set to restore Redis vote totals.`);
  }

  return redisUrl;
};

export const parseArtifactPath = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return "help";
  }

  const positionalArgs = argv.filter((arg) => !arg.startsWith("-"));

  if (positionalArgs.length !== 1) {
    throw new Error("Restore requires exactly one backup artifact path.");
  }

  return positionalArgs[0];
};

export const validateBackupArtifact = (artifact) => {
  if (!isPlainObject(artifact)) {
    throw new Error("Backup artifact must be a JSON object.");
  }

  if (artifact.schemaVersion !== 1) {
    throw new Error("Backup artifact schemaVersion must be 1.");
  }

  if (typeof artifact.createdAt !== "string" || !artifact.createdAt.trim()) {
    throw new Error("Backup artifact createdAt must be a non-empty string.");
  }

  if (Number.isNaN(Date.parse(artifact.createdAt))) {
    throw new Error("Backup artifact createdAt must be a valid date string.");
  }

  if (artifact.keyPattern !== keyPattern) {
    throw new Error(`Backup artifact keyPattern must be ${keyPattern}.`);
  }

  if (!Array.isArray(artifact.records)) {
    throw new Error("Backup artifact records must be an array.");
  }

  const records = artifact.records.map((record, index) => {
    const path = `records[${index}]`;

    if (!isPlainObject(record)) {
      throw new Error(`${path} must be an object.`);
    }

    if (
      typeof record.countryCode !== "string" ||
      !countryCodePattern.test(record.countryCode)
    ) {
      throw new Error(`${path}.countryCode must be a two-letter country code.`);
    }

    const expectedKey = voteTotalsKey(record.countryCode);

    if (record.key !== expectedKey) {
      throw new Error(`${path}.key must be ${expectedKey}.`);
    }

    assertNonNegativeInteger({ value: record.likes, path: `${path}.likes` });
    assertNonNegativeInteger({
      value: record.dislikes,
      path: `${path}.dislikes`,
    });

    if (!isPlainObject(record.fields)) {
      throw new Error(`${path}.fields must be an object.`);
    }

    return {
      key: record.key,
      countryCode: record.countryCode,
      likes: record.likes,
      dislikes: record.dislikes,
    };
  });

  return {
    schemaVersion: artifact.schemaVersion,
    createdAt: artifact.createdAt,
    keyPattern: artifact.keyPattern,
    records,
  };
};

export const readBackupArtifact = async (artifactPath) => {
  let parsed;

  try {
    parsed = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (cause) {
    throw new Error(`Failed to read backup artifact ${artifactPath}.`, {
      cause,
    });
  }

  return validateBackupArtifact(parsed);
};

export const restoreVoteTotals = async ({ backup, redisUrl, clientFactory }) => {
  const client = clientFactory({ url: redisUrl });

  try {
    await client.connect();
  } catch (cause) {
    throw new Error("Failed to connect to Redis for vote restore.", { cause });
  }

  try {
    for (const record of backup.records) {
      try {
        await client.del(record.key);
        await client.hSet(record.key, {
          likes: record.likes.toString(),
          dislikes: record.dislikes.toString(),
        });
      } catch (cause) {
        throw new Error(
          `Failed to restore Redis vote totals for ${record.countryCode}.`,
          { cause },
        );
      }
    }
  } finally {
    await client.close();
  }

  return backup.records.length;
};

export const createRedisClient = (config) => createClient(config);

export const runRestore = async ({
  argv = process.argv.slice(2),
  env = process.env,
  clientFactory = createRedisClient,
} = {}) => {
  const artifactPath = parseArtifactPath(argv);

  if (artifactPath === "help") {
    console.log(usage);
    return;
  }

  const redisUrl = requireRedisUrl(env);
  const backup = await readBackupArtifact(artifactPath);
  const restoredCount = await restoreVoteTotals({
    backup,
    redisUrl,
    clientFactory,
  });

  console.log(`Restored ${restoredCount} Redis country vote total(s).`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRestore().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
