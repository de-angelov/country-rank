import { describe, expect, it, vi } from "vitest";

import type { Country } from "./country";
import { readCountriesWithRedisVoteTotals } from "./redis-totals.server";
import {
  createRedisVoteStorage,
  voteTotalsKey,
  type RedisVoteStorageConfig,
} from "~/votes/storage.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const countries = [
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    flagImageUrl: "https://example.com/jp.svg",
    likes: 900,
    dislikes: 80,
  },
  {
    code: "DE",
    name: "Germany",
    capital: "Berlin",
    flagImageUrl: "https://example.com/de.svg",
    likes: 700,
    dislikes: 140,
  },
] as const satisfies readonly Country[];

const createClient = (
  fieldsByKey: Record<string, Record<string, string>>,
  options: Partial<{
    connect: () => Promise<unknown>;
    hGetAll: (key: string) => Promise<Record<string, string>>;
  }> = {},
) => ({
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  hGetAll: vi.fn(
    options.hGetAll ?? ((key: string) => Promise.resolve(fieldsByKey[key] ?? {})),
  ),
  hIncrBy: vi.fn(() => Promise.resolve(0)),
});

describe("readCountriesWithRedisVoteTotals", () => {
  it("returns fixture metadata in fixture order with Redis-backed totals", async () => {
    const client = createClient({
      [voteTotalsKey("JP")]: { likes: "12", dislikes: "4" },
      [voteTotalsKey("DE")]: { likes: "3", dislikes: "2" },
    });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: (config: RedisVoteStorageConfig) => {
        expect(config.url).toBe(envWithRedisUrl.REDIS_URL);

        return client;
      },
    });

    const result = await readCountriesWithRedisVoteTotals({
      countries,
      readVoteTotals: storage.readCountryVoteTotals,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        ...countries[0],
        likes: 12,
        dislikes: 4,
      },
      {
        ...countries[1],
        likes: 3,
        dislikes: 2,
      },
    ]);
    expect(client.hGetAll).toHaveBeenNthCalledWith(1, voteTotalsKey("JP"));
    expect(client.hGetAll).toHaveBeenNthCalledWith(2, voteTotalsKey("DE"));
  });

  it("uses existing Redis storage defaults for missing vote totals", async () => {
    const client = createClient({
      [voteTotalsKey("JP")]: { likes: "5" },
    });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      countries: [countries[0]],
      readVoteTotals: storage.readCountryVoteTotals,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject([
      {
        code: "JP",
        likes: 5,
        dislikes: 0,
      },
    ]);
  });

  it("returns Redis connection failures without falling back to fixture totals", async () => {
    const connectionError = new Error("redis unavailable");
    const client = createClient(
      {},
      {
        connect: () => Promise.reject(connectionError),
      },
    );
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      countries: [countries[0]],
      readVoteTotals: storage.readCountryVoteTotals,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_connection_failed",
      cause: connectionError,
    });
  });

  it("returns Redis command failures without falling back to fixture totals", async () => {
    const commandError = new Error("read failed");
    const client = createClient(
      {},
      {
        hGetAll: () => Promise.reject(commandError),
      },
    );
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      countries: [countries[0]],
      readVoteTotals: storage.readCountryVoteTotals,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_command_failed",
      cause: commandError,
    });
  });
});
