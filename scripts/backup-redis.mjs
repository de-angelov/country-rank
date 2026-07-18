#!/usr/bin/env node
/* global console, process */
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createClient } from "redis";

export const countryCatalogKey = "country:catalog";
export const countryVoteLikesKey = "country:votes:likes";
export const countryVoteDislikesKey = "country:votes:dislikes";

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-country-votes\.json$/;

const envNames = {
  redisUrl: "REDIS_URL",
  repository: "REDIS_BACKUP_GIT_REPOSITORY",
  branch: "REDIS_BACKUP_BRANCH",
  backupPath: "REDIS_BACKUP_PATH",
  retentionCount: "REDIS_BACKUP_RETENTION_COUNT",
};

const usage = `Usage:
  npm run redis:backup:dry-run
  npm run redis:backup:push

Environment:
  REDIS_URL                         Redis connection URL. Default: redis://localhost:4000
  REDIS_BACKUP_GIT_REPOSITORY       Git repository URL or GitHub owner/repo destination for push mode.
  REDIS_BACKUP_BRANCH               Backup repository branch. Default: main
  REDIS_BACKUP_PATH                 Directory in backup repository. Default: redis
  REDIS_BACKUP_RETENTION_COUNT      Number of newest backups to keep in push mode. Default: 30
`;

const parseMode = (argv) => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return "help";
  }

  if (argv.includes("--push")) {
    return "push";
  }

  return "dry-run";
};

const requireEnv = (env, name) => {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set for Redis backup push mode.`);
  }

  return value;
};

const parseRetentionCount = (value) => {
  if (!value?.trim()) {
    return 30;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${envNames.retentionCount} must be a positive integer.`);
  }

  return parsed;
};

const toBackupFileName = (date) =>
  `${date.toISOString().replaceAll(":", "-").replace(".", "-")}-country-votes.json`;

const toSortedHashFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)),
  );

export const buildBackup = async ({
  redisUrl,
  createdAt,
  clientFactory = createClient,
}) => {
  const client = clientFactory({ url: redisUrl });

  await client.connect();

  try {
    const catalogJson = await client.get(countryCatalogKey);

    if (catalogJson === null) {
      throw new Error(
        `Redis country catalog key ${countryCatalogKey} is missing.`,
      );
    }

    const likes = await client.hGetAll(countryVoteLikesKey);
    const dislikes = await client.hGetAll(countryVoteDislikesKey);

    return {
      schemaVersion: 2,
      createdAt,
      keys: {
        catalog: countryCatalogKey,
        likes: countryVoteLikesKey,
        dislikes: countryVoteDislikesKey,
      },
      countryCatalog: {
        key: countryCatalogKey,
        value: catalogJson,
      },
      voteHashes: {
        likes: {
          key: countryVoteLikesKey,
          fields: toSortedHashFields(likes),
        },
        dislikes: {
          key: countryVoteDislikesKey,
          fields: toSortedHashFields(dislikes),
        },
      },
    };
  } finally {
    await client.close();
  }
};

const writeBackupArtifact = async ({ artifactDirectory, backup, fileName }) => {
  await mkdir(artifactDirectory, { recursive: true });

  const artifactPath = path.join(artifactDirectory, fileName);

  await writeFile(`${artifactPath}.tmp`, `${JSON.stringify(backup, null, 2)}\n`, {
    mode: 0o600,
  });
  await rm(artifactPath, { force: true });
  await rename(`${artifactPath}.tmp`, artifactPath);

  return artifactPath;
};

const normalizeRepositoryUrl = (repository) => {
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return `https://github.com/${repository}.git`;
  }

  return repository;
};

const normalizeBackupPath = (backupPath) => {
  const normalized = path.posix.normalize(backupPath).replace(/^\/+/, "");

  if (!normalized || normalized === "." || normalized.startsWith("../")) {
    throw new Error(`${envNames.backupPath} must be a relative repository path.`);
  }

  return normalized;
};

const runGit = (args, options = {}) => {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    const displayArgs = options.displayArgs ?? args;

    throw new Error(
      `git ${displayArgs.join(" ")} failed:\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
};

const applyRetention = async ({ backupDirectory, retentionCount }) => {
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  const backupFileNames = entries
    .filter((entry) => entry.isFile() && timestampPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const expired = backupFileNames.slice(retentionCount);

  for (const fileName of expired) {
    await rm(path.join(backupDirectory, fileName));
  }

  return expired;
};

const pushBackup = async ({ env, sourceArtifactPath, fileName }) => {
  const repository = requireEnv(env, envNames.repository);
  const branch = env[envNames.branch]?.trim() || "main";
  const backupPath = normalizeBackupPath(
    env[envNames.backupPath]?.trim() || "redis",
  );
  const retentionCount = parseRetentionCount(env[envNames.retentionCount]);
  const repositoryUrl = normalizeRepositoryUrl(repository);
  const checkoutDirectory = await mkdtemp(
    path.join(tmpdir(), "redis-backup-repo-"),
  );

  try {
    runGit([
      "clone",
      "--branch",
      branch,
      "--single-branch",
      repositoryUrl,
      checkoutDirectory,
    ]);

    const targetDirectory = path.join(checkoutDirectory, backupPath);
    await mkdir(targetDirectory, { recursive: true });

    const targetArtifactPath = path.join(targetDirectory, fileName);
    await writeFile(
      targetArtifactPath,
      await readFile(sourceArtifactPath, "utf8"),
      { mode: 0o600 },
    );

    const expired = await applyRetention({
      backupDirectory: targetDirectory,
      retentionCount,
    });

    runGit(["add", backupPath], { cwd: checkoutDirectory });

    const status = runGit(["status", "--porcelain"], { cwd: checkoutDirectory });

    if (!status) {
      return { pushed: false, expired };
    }

    runGit(
      [
        "-c",
        "user.name=Country Ranking Redis Backup",
        "-c",
        "user.email=country-ranking-redis-backup@users.noreply.github.com",
        "commit",
        "-m",
        `Add Redis backup ${fileName}`,
      ],
      { cwd: checkoutDirectory },
    );
    runGit(["push", "origin", `HEAD:${branch}`], { cwd: checkoutDirectory });

    return { pushed: true, expired };
  } finally {
    await rm(checkoutDirectory, { recursive: true, force: true });
  }
};

const main = async () => {
  const mode = parseMode(process.argv.slice(2));

  if (mode === "help") {
    console.log(usage);
    return;
  }

  const createdAt = new Date().toISOString();
  const fileName = toBackupFileName(new Date(createdAt));
  const redisUrl =
    process.env[envNames.redisUrl]?.trim() || "redis://localhost:4000";
  const artifactDirectory =
    mode === "dry-run"
      ? path.resolve("tmp", "redis-backups")
      : await mkdtemp(path.join(tmpdir(), "redis-backup-artifact-"));

  const backup = await buildBackup({ redisUrl, createdAt });
  const artifactPath = await writeBackupArtifact({
    artifactDirectory,
    backup,
    fileName,
  });

  if (mode === "dry-run") {
    console.log(`Created Redis backup artifact: ${artifactPath}`);
    console.log(
      `Exported Redis country catalog and ${Object.keys(backup.voteHashes.likes.fields).length} country vote total(s).`,
    );
    return;
  }

  const result = await pushBackup({
    env: process.env,
    sourceArtifactPath: artifactPath,
    fileName,
  });

  if (result.pushed) {
    console.log(`Pushed Redis backup artifact: ${fileName}`);
  } else {
    console.log(`No Redis backup changes to push for: ${fileName}`);
  }

  if (result.expired.length > 0) {
    console.log(`Expired ${result.expired.length} old backup artifact(s).`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
