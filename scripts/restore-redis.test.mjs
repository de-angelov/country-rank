import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requireRedisUrl,
  restoreVoteTotals,
  runRestore,
  validateBackupArtifact,
} from "./restore-redis.mjs";

const tempDirectories = [];

const validArtifact = {
  schemaVersion: 1,
  createdAt: "2026-07-16T13:00:00.000Z",
  keyPattern: "country:votes:*",
  records: [
    {
      key: "country:votes:US",
      countryCode: "US",
      likes: 12,
      dislikes: 4,
      fields: {
        likes: "12",
        dislikes: "4",
      },
    },
    {
      key: "country:votes:GB",
      countryCode: "GB",
      likes: 7,
      dislikes: 2,
      fields: {
        likes: "7",
        dislikes: "2",
      },
    },
  ],
};

const createTempArtifact = async (artifact) => {
  const directory = await mkdtemp(path.join(tmpdir(), "redis-restore-test-"));
  tempDirectories.push(directory);
  const artifactPath = path.join(directory, "backup.json");

  await writeFile(artifactPath, `${JSON.stringify(artifact)}\n`);

  return artifactPath;
};

const createClient = (
  options = {},
) => ({
  close: vi.fn(options.close ?? (() => Promise.resolve())),
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  del: vi.fn(options.del ?? (() => Promise.resolve(1))),
  hSet: vi.fn(options.hSet ?? (() => Promise.resolve(2))),
});

afterEach(async () => {
  vi.restoreAllMocks();

  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("requireRedisUrl", () => {
  it("fails clearly when Redis configuration is missing", () => {
    expect(() => requireRedisUrl({})).toThrow(
      "REDIS_URL must be set to restore Redis vote totals.",
    );
  });
});

describe("validateBackupArtifact", () => {
  it("accepts the backup artifact shape produced by the backup runner", () => {
    expect(validateBackupArtifact(validArtifact)).toEqual({
      schemaVersion: 1,
      createdAt: "2026-07-16T13:00:00.000Z",
      keyPattern: "country:votes:*",
      records: [
        {
          key: "country:votes:US",
          countryCode: "US",
          likes: 12,
          dislikes: 4,
        },
        {
          key: "country:votes:GB",
          countryCode: "GB",
          likes: 7,
          dislikes: 2,
        },
      ],
    });
  });

  it("rejects malformed backup records", () => {
    expect(() =>
      validateBackupArtifact({
        ...validArtifact,
        records: [
          {
            ...validArtifact.records[0],
            key: "country:votes:GB",
          },
        ],
      }),
    ).toThrow("records[0].key must be country:votes:US.");
  });
});

describe("restoreVoteTotals", () => {
  it("replaces Redis vote totals for countries present in the artifact", async () => {
    const client = createClient();

    await expect(
      restoreVoteTotals({
        backup: validateBackupArtifact(validArtifact),
        redisUrl: "redis://localhost:6379",
        clientFactory: () => client,
      }),
    ).resolves.toBe(2);

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.del).toHaveBeenNthCalledWith(1, "country:votes:US");
    expect(client.hSet).toHaveBeenNthCalledWith(1, "country:votes:US", {
      likes: "12",
      dislikes: "4",
    });
    expect(client.del).toHaveBeenNthCalledWith(2, "country:votes:GB");
    expect(client.hSet).toHaveBeenNthCalledWith(2, "country:votes:GB", {
      likes: "7",
      dislikes: "2",
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("fails clearly when a Redis command fails", async () => {
    const commandError = new Error("readonly");
    const client = createClient({
      hSet: () => Promise.reject(commandError),
    });

    await expect(
      restoreVoteTotals({
        backup: validateBackupArtifact(validArtifact),
        redisUrl: "redis://localhost:6379",
        clientFactory: () => client,
      }),
    ).rejects.toThrow("Failed to restore Redis vote totals for US.");

    expect(client.close).toHaveBeenCalledOnce();
  });
});

describe("runRestore", () => {
  it("validates the artifact before connecting to Redis", async () => {
    const artifactPath = await createTempArtifact({
      ...validArtifact,
      records: [
        {
          ...validArtifact.records[0],
          likes: "12",
        },
      ],
    });
    const clientFactory = vi.fn(() => createClient());

    await expect(
      runRestore({
        argv: [artifactPath],
        env: { REDIS_URL: "redis://localhost:6379" },
        clientFactory,
      }),
    ).rejects.toThrow("records[0].likes must be a non-negative integer.");

    expect(clientFactory).not.toHaveBeenCalled();
  });
});
