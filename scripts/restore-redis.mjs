#!/usr/bin/env node
/* global URL, console, process */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createClient } from "redis";

const redisUrlEnvVar = "REDIS_URL";
const countryCodePattern = /^[A-Z]{2}$/;
const integerStringPattern = /^(0|[1-9]\d*)$/;
const unknownCountryCapital = "Unknown";

export const countryCatalogKey = "country:catalog";
export const countryVoteLikesKey = "country:votes:likes";
export const countryVoteDislikesKey = "country:votes:dislikes";

const usage = `Usage:
  REDIS_URL=redis://localhost:6379 npm run restore:redis -- <backup-artifact.json>

Environment:
  REDIS_URL    Redis connection URL.

Behavior:
  Replaces the Redis country catalog and aggregate country vote hashes from the backup artifact.
`;

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertKey = ({ value, path, expectedKey }) => {
  if (value !== expectedKey) {
    throw new Error(`${path} must be ${expectedKey}.`);
  }
};

const assertCatalogJson = ({ value, path }) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path} must be a non-empty JSON string.`);
  }

  let catalog;

  try {
    catalog = JSON.parse(value);
  } catch {
    throw new Error(`${path} must be valid JSON.`);
  }

  if (!Array.isArray(catalog)) {
    throw new Error(`${path} must encode an array.`);
  }

  const seenCodes = new Set();

  catalog.forEach((record, index) => {
    const recordPath = `${path}[${index}]`;

    if (!isPlainObject(record)) {
      throw new Error(`${recordPath} must be an object.`);
    }

    if (
      typeof record.code !== "string" ||
      !countryCodePattern.test(record.code)
    ) {
      throw new Error(`${recordPath}.code must be a two-letter country code.`);
    }

    if (seenCodes.has(record.code)) {
      throw new Error(`${recordPath}.code must be unique.`);
    }

    seenCodes.add(record.code);

    if (typeof record.name !== "string" || !record.name.trim()) {
      throw new Error(`${recordPath}.name must be a non-empty string.`);
    }

    if (
      (typeof record.capital !== "string" || !record.capital.trim()) &&
      record.capital !== unknownCountryCapital
    ) {
      throw new Error(
        `${recordPath}.capital must be a non-empty string or ${unknownCountryCapital}.`,
      );
    }

    if (typeof record.factSnippet !== "string" || !record.factSnippet.trim()) {
      throw new Error(`${recordPath}.factSnippet must be a non-empty string.`);
    }

    try {
      if (
        typeof record.flagImageUrl !== "string" ||
        new URL(record.flagImageUrl).protocol !== "https:"
      ) {
        throw new Error();
      }
    } catch {
      throw new Error(`${recordPath}.flagImageUrl must be an HTTPS URL.`);
    }
  });
};

const validateVoteHashFields = ({ fields, path }) => {
  if (!isPlainObject(fields)) {
    throw new Error(`${path} must be an object.`);
  }

  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([countryCode, value]) => {
        if (!countryCodePattern.test(countryCode)) {
          throw new Error(
            `${path}.${countryCode} must use a two-letter country code field.`,
          );
        }

        if (typeof value !== "string" || !integerStringPattern.test(value)) {
          throw new Error(
            `${path}.${countryCode} must be a non-negative integer string.`,
          );
        }

        return [countryCode, value];
      }),
  );
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

  if (artifact.schemaVersion !== 2) {
    throw new Error("Backup artifact schemaVersion must be 2.");
  }

  if (typeof artifact.createdAt !== "string" || !artifact.createdAt.trim()) {
    throw new Error("Backup artifact createdAt must be a non-empty string.");
  }

  if (Number.isNaN(Date.parse(artifact.createdAt))) {
    throw new Error("Backup artifact createdAt must be a valid date string.");
  }

  if (!isPlainObject(artifact.keys)) {
    throw new Error("Backup artifact keys must be an object.");
  }

  assertKey({
    value: artifact.keys.catalog,
    path: "keys.catalog",
    expectedKey: countryCatalogKey,
  });
  assertKey({
    value: artifact.keys.likes,
    path: "keys.likes",
    expectedKey: countryVoteLikesKey,
  });
  assertKey({
    value: artifact.keys.dislikes,
    path: "keys.dislikes",
    expectedKey: countryVoteDislikesKey,
  });

  if (!isPlainObject(artifact.countryCatalog)) {
    throw new Error("Backup artifact countryCatalog must be an object.");
  }

  assertKey({
    value: artifact.countryCatalog.key,
    path: "countryCatalog.key",
    expectedKey: countryCatalogKey,
  });
  assertCatalogJson({
    value: artifact.countryCatalog.value,
    path: "countryCatalog.value",
  });

  if (!isPlainObject(artifact.voteHashes)) {
    throw new Error("Backup artifact voteHashes must be an object.");
  }

  if (!isPlainObject(artifact.voteHashes.likes)) {
    throw new Error("voteHashes.likes must be an object.");
  }

  assertKey({
    value: artifact.voteHashes.likes.key,
    path: "voteHashes.likes.key",
    expectedKey: countryVoteLikesKey,
  });

  if (!isPlainObject(artifact.voteHashes.dislikes)) {
    throw new Error("voteHashes.dislikes must be an object.");
  }

  assertKey({
    value: artifact.voteHashes.dislikes.key,
    path: "voteHashes.dislikes.key",
    expectedKey: countryVoteDislikesKey,
  });

  const likeFields = validateVoteHashFields({
    fields: artifact.voteHashes.likes.fields,
    path: "voteHashes.likes.fields",
  });
  const dislikeFields = validateVoteHashFields({
    fields: artifact.voteHashes.dislikes.fields,
    path: "voteHashes.dislikes.fields",
  });

  return {
    schemaVersion: artifact.schemaVersion,
    createdAt: artifact.createdAt,
    keys: {
      catalog: countryCatalogKey,
      likes: countryVoteLikesKey,
      dislikes: countryVoteDislikesKey,
    },
    countryCatalog: {
      key: countryCatalogKey,
      value: artifact.countryCatalog.value,
    },
    voteHashes: {
      likes: {
        key: countryVoteLikesKey,
        fields: likeFields,
      },
      dislikes: {
        key: countryVoteDislikesKey,
        fields: dislikeFields,
      },
    },
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

const replaceHash = async ({ client, key, fields }) => {
  await client.del(key);

  if (Object.keys(fields).length > 0) {
    await client.hSet(key, fields);
  }
};

export const restoreCountryData = async ({
  backup,
  redisUrl,
  clientFactory,
}) => {
  const client = clientFactory({ url: redisUrl });

  try {
    await client.connect();
  } catch (cause) {
    throw new Error("Failed to connect to Redis for vote restore.", { cause });
  }

  try {
    try {
      await client.set(backup.countryCatalog.key, backup.countryCatalog.value);
      await replaceHash({
        client,
        key: backup.voteHashes.likes.key,
        fields: backup.voteHashes.likes.fields,
      });
      await replaceHash({
        client,
        key: backup.voteHashes.dislikes.key,
        fields: backup.voteHashes.dislikes.fields,
      });
    } catch (cause) {
      throw new Error("Failed to restore Redis country data.", { cause });
    }
  } finally {
    await client.close();
  }

  return {
    catalogKey: backup.countryCatalog.key,
    voteHashCount: 2,
  };
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
  const restored = await restoreCountryData({
    backup,
    redisUrl,
    clientFactory,
  });

  console.log(
    `Restored ${restored.catalogKey} and ${restored.voteHashCount} Redis country vote hash(es).`,
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRestore().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
