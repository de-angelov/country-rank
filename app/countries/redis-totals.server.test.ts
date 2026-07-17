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
    factSnippet: "Test snippet for Japan.",
    flagImageUrl: "https://example.com/jp.svg",
    likes: 900,
    dislikes: 80,
  },
  {
    code: "DE",
    name: "Germany",
    capital: "Berlin",
    factSnippet: "Test snippet for Germany.",
    flagImageUrl: "https://example.com/de.svg",
    likes: 700,
    dislikes: 140,
  },
] as const satisfies readonly Country[];

const createClient = (
  fieldsByKey: Partial<Record<"likes" | "dislikes", Record<string, string>>>,
  options: Partial<{
    connect: () => Promise<unknown>;
    hGet: (key: string, field: string) => Promise<string | null>;
  }> = {},
) => ({
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  hGet: vi.fn(
    options.hGet ??
      ((key: string, field: string) => {
        const totals =
          key === voteTotalsKey("like")
            ? fieldsByKey.likes
            : fieldsByKey.dislikes;

        return Promise.resolve(totals?.[field] ?? null);
      }),
  ),
  hIncrBy: vi.fn(() => Promise.resolve(0)),
});

describe("readCountriesWithRedisVoteTotals", () => {
  it("returns fixture metadata in fixture order with Redis-backed totals", async () => {
    const client = createClient({
      likes: { JP: "12", DE: "3" },
      dislikes: { JP: "4", DE: "2" },
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
    expect(client.hGet).toHaveBeenNthCalledWith(
      1,
      voteTotalsKey("like"),
      "JP",
    );
    expect(client.hGet).toHaveBeenNthCalledWith(
      2,
      voteTotalsKey("dislike"),
      "JP",
    );
    expect(client.hGet).toHaveBeenNthCalledWith(
      3,
      voteTotalsKey("like"),
      "DE",
    );
    expect(client.hGet).toHaveBeenNthCalledWith(
      4,
      voteTotalsKey("dislike"),
      "DE",
    );
  });

  it("uses existing Redis storage defaults for missing vote totals", async () => {
    const client = createClient({
      likes: { JP: "5" },
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
        hGet: () => Promise.reject(commandError),
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
