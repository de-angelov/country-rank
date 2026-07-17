import { describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";

import type { CountryCatalogProfile } from "./redis-catalog.server";
import { readCountriesWithRedisVoteTotals } from "./redis-totals.server";
import {
  createRedisVoteStorage,
  voteTotalsKey,
  type RedisVoteStorageConfig,
} from "~/votes/storage.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const catalog = [
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    factSnippet: "Test snippet for Japan.",
    flagImageUrl: "https://example.com/jp.svg",
  },
  {
    code: "DE",
    name: "Germany",
    capital: "Berlin",
    factSnippet: "Test snippet for Germany.",
    flagImageUrl: "https://example.com/de.svg",
  },
] as const satisfies readonly CountryCatalogProfile[];

const createClient = (
  fieldsByKey: Partial<Record<"likes" | "dislikes", Record<string, string>>>,
  options: Partial<{
    connect: () => Promise<unknown>;
    hGetAll: (key: string) => Promise<Record<string, string>>;
  }> = {},
) => ({
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  hGet: vi.fn(() => Promise.resolve(null)),
  hGetAll: vi.fn(
    options.hGetAll ??
      ((key: string) =>
        Promise.resolve(
          key === voteTotalsKey("like")
            ? (fieldsByKey.likes ?? {})
            : (fieldsByKey.dislikes ?? {}),
        )),
  ),
  hIncrBy: vi.fn(() => Promise.resolve(0)),
});

describe("readCountriesWithRedisVoteTotals", () => {
  it("returns Redis catalog metadata in catalog order with aggregate Redis-backed totals", async () => {
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
      readCatalog: () => okAsync(catalog),
      readVoteTotals: storage.readAllCountryVoteTotals,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        ...catalog[0],
        likes: 12,
        dislikes: 4,
      },
      {
        ...catalog[1],
        likes: 3,
        dislikes: 2,
      },
    ]);
    expect(client.hGetAll).toHaveBeenNthCalledWith(
      1,
      voteTotalsKey("like"),
    );
    expect(client.hGetAll).toHaveBeenNthCalledWith(
      2,
      voteTotalsKey("dislike"),
    );
    expect(client.hGet).not.toHaveBeenCalled();
  });

  it("defaults catalog countries missing from aggregate vote hashes to zero", async () => {
    const client = createClient({
      likes: { JP: "5" },
    });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      readCatalog: () => okAsync([catalog[0]]),
      readVoteTotals: storage.readAllCountryVoteTotals,
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
      readCatalog: () => okAsync([catalog[0]]),
      readVoteTotals: storage.readAllCountryVoteTotals,
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
      readCatalog: () => okAsync([catalog[0]]),
      readVoteTotals: storage.readAllCountryVoteTotals,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_command_failed",
      cause: commandError,
    });
  });

  it("returns malformed Redis vote total failures without falling back to fixture totals", async () => {
    const client = createClient({
      likes: { JP: "not-a-number" },
    });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      readCatalog: () => okAsync([catalog[0]]),
      readVoteTotals: storage.readAllCountryVoteTotals,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "malformed_vote_total",
      key: voteTotalsKey("like"),
      field: "JP",
      value: "not-a-number",
    });
  });

  it("returns catalog failures without falling back to fixture metadata", async () => {
    const catalogError = {
      code: "missing_country_catalog" as const,
      message: "Redis country catalog is missing.",
      key: "country:catalog" as const,
    };
    const client = createClient({
      likes: { JP: "5" },
    });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await readCountriesWithRedisVoteTotals({
      readCatalog: () => errAsync(catalogError),
      readVoteTotals: storage.readAllCountryVoteTotals,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject(catalogError);
  });
});
