import { describe, expect, it, vi } from "vitest";

import { buildBackup } from "./backup-redis.mjs";
import {
  countryCatalogKey,
  countryVoteDislikesKey,
  countryVoteLikesKey,
  seedRedisCountryData,
} from "./seed-redis-votes.mjs";
import {
  restoreCountryData,
  validateBackupArtifact,
} from "./restore-redis.mjs";
import { countryFixtures } from "../app/countries/fixtures";

const createMemoryRedisClientFactory = () => {
  const values = new Map();
  const hashes = new Map();
  const clients = [];

  const deleteKey = (key) => {
    values.delete(key);
    hashes.delete(key);
  };

  const clientFactory = vi.fn(() => {
    const client = {
      close: vi.fn(() => Promise.resolve()),
      connect: vi.fn(() => Promise.resolve()),
      del: vi.fn((keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          deleteKey(key);
        }

        return Promise.resolve();
      }),
      get: vi.fn((key) => Promise.resolve(values.get(key) ?? null)),
      hGetAll: vi.fn((key) => Promise.resolve(hashes.get(key) ?? {})),
      hSet: vi.fn((key, fields) => {
        hashes.set(key, { ...(hashes.get(key) ?? {}), ...fields });

        return Promise.resolve(Object.keys(fields).length);
      }),
      set: vi.fn((key, value) => {
        values.set(key, value);

        return Promise.resolve("OK");
      }),
    };

    clients.push(client);

    return client;
  });

  return {
    clientFactory,
    clients,
    snapshot: () => ({
      catalog: values.get(countryCatalogKey),
      likes: hashes.get(countryVoteLikesKey),
      dislikes: hashes.get(countryVoteDislikesKey),
    }),
  };
};

describe("Redis country data backup and restore round trip", () => {
  it("preserves the optimized catalog and aggregate vote hashes", async () => {
    const sourceRedis = createMemoryRedisClientFactory();
    const restoredRedis = createMemoryRedisClientFactory();

    await seedRedisCountryData({
      redisUrl: "redis://source.example:6379",
      countryFixtures,
      clientFactory: sourceRedis.clientFactory,
    });

    const backup = validateBackupArtifact(
      await buildBackup({
        redisUrl: "redis://source.example:6379",
        createdAt: "2026-07-16T13:00:00.000Z",
        clientFactory: sourceRedis.clientFactory,
      }),
    );

    await restoreCountryData({
      backup,
      redisUrl: "redis://restored.example:6379",
      clientFactory: restoredRedis.clientFactory,
    });

    const sourceSnapshot = sourceRedis.snapshot();
    const restoredSnapshot = restoredRedis.snapshot();
    const expectedCountryCodes = countryFixtures
      .map((country) => country.code)
      .sort();

    expect(backup.keys).toEqual({
      catalog: countryCatalogKey,
      likes: countryVoteLikesKey,
      dislikes: countryVoteDislikesKey,
    });
    expect(JSON.parse(restoredSnapshot.catalog)).toEqual(
      JSON.parse(sourceSnapshot.catalog),
    );
    expect(Object.keys(restoredSnapshot.likes).sort()).toEqual(
      expectedCountryCodes,
    );
    expect(Object.keys(restoredSnapshot.dislikes).sort()).toEqual(
      expectedCountryCodes,
    );
    expect(restoredSnapshot).toEqual(sourceSnapshot);
    expect(restoredRedis.clients[0].set).toHaveBeenCalledWith(
      countryCatalogKey,
      backup.countryCatalog.value,
    );
    expect(restoredRedis.clients[0].del).toHaveBeenNthCalledWith(
      1,
      countryVoteLikesKey,
    );
    expect(restoredRedis.clients[0].del).toHaveBeenNthCalledWith(
      2,
      countryVoteDislikesKey,
    );
  });
});
