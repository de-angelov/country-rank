import { describe, expect, it, vi } from "vitest";

import {
  createRedisVoteStorage,
  getRedisVoteStorageConfig,
  voteTotalsKey,
  type RedisVoteStorageConfig,
} from "./storage.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const createClient = (
  initialFields: Record<string, string> = {},
  options: Partial<{
    connect: () => Promise<unknown>;
    hGetAll: (key: string) => Promise<Record<string, string>>;
    hIncrBy: (
      key: string,
      field: string,
      increment: number,
    ) => Promise<number>;
  }> = {},
) => {
  const fields = { ...initialFields };
  const client = {
    connect: vi.fn(options.connect ?? (() => Promise.resolve())),
    hGetAll: vi.fn(
      options.hGetAll ?? (() => Promise.resolve({ ...fields })),
    ),
    hIncrBy: vi.fn(
      options.hIncrBy ??
        ((_key: string, field: string, increment: number) => {
          fields[field] = String(Number(fields[field] ?? 0) + increment);

          return Promise.resolve(Number(fields[field]));
        }),
    ),
  };

  return client;
};

describe("getRedisVoteStorageConfig", () => {
  it("returns a clear error when Redis configuration is missing", () => {
    const result = getRedisVoteStorageConfig({});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "missing_redis_config",
      envVar: "REDIS_URL",
    });
  });

  it("reads Redis connection details from the environment", () => {
    const result = getRedisVoteStorageConfig(envWithRedisUrl);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      url: "redis://localhost:6379",
    });
  });
});

describe("createRedisVoteStorage", () => {
  it("reads country vote totals from Redis", async () => {
    const client = createClient({ likes: "12", dislikes: "4" });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await storage.readCountryVoteTotals("us");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      countryCode: "US",
      likes: 12,
      dislikes: 4,
    });
    expect(client.hGetAll).toHaveBeenCalledWith(voteTotalsKey("US"));
  });

  it("defaults missing Redis totals to zero", async () => {
    const client = createClient();
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await storage.readCountryVoteTotals("GB");

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      likes: 0,
      dislikes: 0,
    });
  });

  it("increments like and dislike totals by country code", async () => {
    const client = createClient({ likes: "2", dislikes: "8" });
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: (config: RedisVoteStorageConfig) => {
        expect(config.url).toBe(envWithRedisUrl.REDIS_URL);

        return client;
      },
    });

    const likeResult = await storage.incrementCountryVoteTotal("JP", "like");
    const dislikeResult = await storage.incrementCountryVoteTotal(
      "JP",
      "dislike",
    );

    expect(likeResult._unsafeUnwrap()).toEqual({
      countryCode: "JP",
      likes: 3,
      dislikes: 8,
    });
    expect(dislikeResult._unsafeUnwrap()).toEqual({
      countryCode: "JP",
      likes: 3,
      dislikes: 9,
    });
    expect(client.hIncrBy).toHaveBeenNthCalledWith(
      1,
      voteTotalsKey("JP"),
      "likes",
      1,
    );
    expect(client.hIncrBy).toHaveBeenNthCalledWith(
      2,
      voteTotalsKey("JP"),
      "dislikes",
      1,
    );
  });

  it("does not connect to Redis for invalid country codes", async () => {
    const client = createClient();
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await storage.readCountryVoteTotals("USA");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invalid_country_code",
      countryCode: "USA",
    });
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("returns Redis command failures as result errors", async () => {
    const commandError = new Error("boom");
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

    const result = await storage.readCountryVoteTotals("DE");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_command_failed",
      cause: commandError,
    });
  });

  it("returns Redis connection failures as result errors", async () => {
    const connectionError = new Error("refused");
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

    const result = await storage.readCountryVoteTotals("CA");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_connection_failed",
      cause: connectionError,
    });
  });
});
