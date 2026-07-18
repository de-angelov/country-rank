import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requireRedisUrl,
  restoreCountryData,
  runRestore,
  validateBackupArtifact,
} from "./restore-redis.mjs";

const tempDirectories = [];

const validArtifact = {
  schemaVersion: 2,
  createdAt: "2026-07-16T13:00:00.000Z",
  keys: {
    catalog: "country:catalog",
    likes: "country:votes:likes",
    dislikes: "country:votes:dislikes",
  },
  countryCatalog: {
    key: "country:catalog",
    value: JSON.stringify([
      {
        code: "US",
        name: "United States",
        capital: "Washington, D.C.",
        factSnippet: "Large parks, loud snacks, and federal districts.",
        flagImageUrl: "https://example.com/us.svg",
      },
      {
        code: "GB",
        name: "United Kingdom",
        capital: "London",
        factSnippet: "Queue science, old stones, and kettle diplomacy.",
        flagImageUrl: "https://example.com/gb.svg",
      },
    ]),
  },
  voteHashes: {
    likes: {
      key: "country:votes:likes",
      fields: {
        US: "12",
        GB: "7",
      },
    },
    dislikes: {
      key: "country:votes:dislikes",
      fields: {
        US: "4",
        GB: "2",
      },
    },
  },
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
  set: vi.fn(options.set ?? (() => Promise.resolve("OK"))),
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
      schemaVersion: 2,
      createdAt: "2026-07-16T13:00:00.000Z",
      keys: {
        catalog: "country:catalog",
        likes: "country:votes:likes",
        dislikes: "country:votes:dislikes",
      },
      countryCatalog: {
        key: "country:catalog",
        value: validArtifact.countryCatalog.value,
      },
      voteHashes: {
        likes: {
          key: "country:votes:likes",
          fields: {
            GB: "7",
            US: "12",
          },
        },
        dislikes: {
          key: "country:votes:dislikes",
          fields: {
            GB: "2",
            US: "4",
          },
        },
      },
    });
  });

  it("rejects malformed optimized vote hashes", () => {
    expect(() =>
      validateBackupArtifact({
        ...validArtifact,
        voteHashes: {
          ...validArtifact.voteHashes,
          likes: {
            ...validArtifact.voteHashes.likes,
            fields: {
              ...validArtifact.voteHashes.likes.fields,
              USA: "12",
            },
          },
        },
      }),
    ).toThrow(
      "voteHashes.likes.fields.USA must use a two-letter country code field.",
    );
  });
});

describe("restoreCountryData", () => {
  it("replaces the Redis catalog before aggregate vote hashes", async () => {
    const client = createClient();

    await expect(
      restoreCountryData({
        backup: validateBackupArtifact(validArtifact),
        redisUrl: "redis://localhost:4000",
        clientFactory: () => client,
      }),
    ).resolves.toEqual({
      catalogKey: "country:catalog",
      voteHashCount: 2,
    });

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.set).toHaveBeenCalledWith(
      "country:catalog",
      validArtifact.countryCatalog.value,
    );
    expect(client.set.mock.invocationCallOrder[0]).toBeLessThan(
      client.del.mock.invocationCallOrder[0],
    );
    expect(client.del).toHaveBeenNthCalledWith(1, "country:votes:likes");
    expect(client.hSet).toHaveBeenNthCalledWith(1, "country:votes:likes", {
      GB: "7",
      US: "12",
    });
    expect(client.del).toHaveBeenNthCalledWith(2, "country:votes:dislikes");
    expect(client.hSet).toHaveBeenNthCalledWith(2, "country:votes:dislikes", {
      GB: "2",
      US: "4",
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("fails clearly when a Redis command fails", async () => {
    const commandError = new Error("readonly");
    const client = createClient({
      hSet: () => Promise.reject(commandError),
    });

    await expect(
      restoreCountryData({
        backup: validateBackupArtifact(validArtifact),
        redisUrl: "redis://localhost:4000",
        clientFactory: () => client,
      }),
    ).rejects.toThrow("Failed to restore Redis country data.");

    expect(client.close).toHaveBeenCalledOnce();
  });
});

describe("runRestore", () => {
  it("validates the artifact before connecting to Redis", async () => {
    const artifactPath = await createTempArtifact({
      ...validArtifact,
      voteHashes: {
        ...validArtifact.voteHashes,
        likes: {
          ...validArtifact.voteHashes.likes,
          fields: {
            ...validArtifact.voteHashes.likes.fields,
            US: 12,
          },
        },
      },
    });
    const clientFactory = vi.fn(() => createClient());

    await expect(
      runRestore({
        argv: [artifactPath],
        env: { REDIS_URL: "redis://localhost:4000" },
        clientFactory,
      }),
    ).rejects.toThrow(
      "voteHashes.likes.fields.US must be a non-negative integer string.",
    );

    expect(clientFactory).not.toHaveBeenCalled();
  });
});
