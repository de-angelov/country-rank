import { describe, expect, it, vi } from "vitest";

import { buildBackup } from "./backup-redis.mjs";

const catalogJson = JSON.stringify([
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
]);

const createClient = (options = {}) => ({
  close: vi.fn(options.close ?? (() => Promise.resolve())),
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  get: vi.fn(options.get ?? (() => Promise.resolve(catalogJson))),
  hGetAll: vi.fn((key) => {
    if (key === "country:votes:likes") {
      return Promise.resolve({
        US: "12",
        GB: "7",
      });
    }

    return Promise.resolve({
      US: "4",
      GB: "2",
    });
  }),
});

describe("buildBackup", () => {
  it("exports the Redis country catalog and aggregate vote hashes", async () => {
    const client = createClient();

    await expect(
      buildBackup({
        redisUrl: "redis://localhost:4000",
        createdAt: "2026-07-16T13:00:00.000Z",
        clientFactory: () => client,
      }),
    ).resolves.toEqual({
      schemaVersion: 2,
      createdAt: "2026-07-16T13:00:00.000Z",
      keys: {
        catalog: "country:catalog",
        likes: "country:votes:likes",
        dislikes: "country:votes:dislikes",
      },
      countryCatalog: {
        key: "country:catalog",
        value: catalogJson,
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

    expect(client.get).toHaveBeenCalledWith("country:catalog");
    expect(client.hGetAll).toHaveBeenNthCalledWith(1, "country:votes:likes");
    expect(client.hGetAll).toHaveBeenNthCalledWith(2, "country:votes:dislikes");
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("fails clearly when the Redis country catalog is missing", async () => {
    const client = createClient({
      get: () => Promise.resolve(null),
    });

    await expect(
      buildBackup({
        redisUrl: "redis://localhost:4000",
        createdAt: "2026-07-16T13:00:00.000Z",
        clientFactory: () => client,
      }),
    ).rejects.toThrow("Redis country catalog key country:catalog is missing.");

    expect(client.close).toHaveBeenCalledOnce();
  });
});
