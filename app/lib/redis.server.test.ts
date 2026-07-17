import { describe, expect, it, vi } from "vitest";

import {
  createRedisClientProvider,
  getRedisConfig,
  type RedisConfig,
} from "./redis.server";

const envWithRedisUrl = {
  REDIS_URL: " redis://localhost:6379 ",
};

const createClient = (
  connect: () => Promise<unknown> = () => Promise.resolve(),
) => ({
  connect: vi.fn(connect),
});

const createProvider = (
  options: Partial<{
    env: NodeJS.ProcessEnv;
    clientFactory: (config: RedisConfig) => ReturnType<typeof createClient>;
  }> = {},
) =>
  createRedisClientProvider({
    env: options.env ?? envWithRedisUrl,
    clientFactory:
      options.clientFactory ?? (() => createClient()),
    missingConfigMessage: "REDIS_URL is required for tests.",
    connectionFailureMessage: "Redis test connection failed.",
  });

describe("getRedisConfig", () => {
  it("returns a typed error when REDIS_URL is missing", () => {
    const result = getRedisConfig({}, "REDIS_URL must be set.");

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_redis_config",
      message: "REDIS_URL must be set.",
      envVar: "REDIS_URL",
    });
  });

  it("trims REDIS_URL from the environment", () => {
    const result = getRedisConfig(envWithRedisUrl);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      url: "redis://localhost:6379",
    });
  });
});

describe("createRedisClientProvider", () => {
  it("creates a lazy connection and reuses the connected client", async () => {
    const client = createClient();
    const clientFactory = vi.fn(() => client);
    const getClient = createProvider({ clientFactory });

    const firstResult = await getClient();
    const secondResult = await getClient();

    expect(firstResult.isOk()).toBe(true);
    expect(secondResult.isOk()).toBe(true);
    expect(firstResult._unsafeUnwrap()).toBe(client);
    expect(secondResult._unsafeUnwrap()).toBe(client);
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("does not create a client when configuration is missing", async () => {
    const clientFactory = vi.fn(() => createClient());
    const getClient = createProvider({ env: {}, clientFactory });

    const result = await getClient();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "missing_redis_config",
      envVar: "REDIS_URL",
    });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("clears failed connection attempts so later calls can retry", async () => {
    const connectionError = new Error("first connection failed");
    const firstClient = createClient(() => Promise.reject(connectionError));
    const secondClient = createClient();
    const clientFactory = vi
      .fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const getClient = createProvider({ clientFactory });

    const firstResult = await getClient();
    const secondResult = await getClient();

    expect(firstResult.isErr()).toBe(true);
    expect(firstResult._unsafeUnwrapErr()).toMatchObject({
      code: "redis_connection_failed",
      cause: connectionError,
    });
    expect(secondResult.isOk()).toBe(true);
    expect(secondResult._unsafeUnwrap()).toBe(secondClient);
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(firstClient.connect).toHaveBeenCalledTimes(1);
    expect(secondClient.connect).toHaveBeenCalledTimes(1);
  });
});
