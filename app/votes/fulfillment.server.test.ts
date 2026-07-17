import { describe, expect, it, vi } from "vitest";

import type { ApplicationLogger } from "~/lib/logger.server";
import {
  createRedisPaidVoteFulfillmentStorage,
  paidVoteFulfillmentKey,
  type RedisPaidVoteFulfillmentConfig,
} from "./fulfillment.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const createClient = (
  initialRecords: Record<string, string> = {},
  options: Partial<{
    connect: () => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<unknown>;
  }> = {},
) => {
  const records = { ...initialRecords };
  const client = {
    connect: vi.fn(options.connect ?? (() => Promise.resolve())),
    get: vi.fn(
      options.get ??
        ((key: string) => Promise.resolve(records[key] ?? null)),
    ),
    set: vi.fn(
      options.set ??
        ((key: string, value: string) => {
          records[key] = value;

          return Promise.resolve("OK");
        }),
    ),
  };

  return client;
};

const createStorageWithClient = (
  client: ReturnType<typeof createClient>,
  logger?: ApplicationLogger,
) =>
  createRedisPaidVoteFulfillmentStorage({
    env: envWithRedisUrl,
    logger,
    clientFactory: (config: RedisPaidVoteFulfillmentConfig) => {
      expect(config.url).toBe(envWithRedisUrl.REDIS_URL);

      return client;
    },
  });

const createMockLogger = (): ApplicationLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("createRedisPaidVoteFulfillmentStorage", () => {
  it("writes and reads an applied paid vote fulfillment record", async () => {
    const client = createClient();
    const storage = createStorageWithClient(client);
    const record = {
      status: "applied" as const,
      checkoutSessionId: "cs_test_123",
      countryCode: "JP",
      voteType: "like" as const,
      totals: {
        countryCode: "JP",
        likes: 12,
        dislikes: 4,
      },
    };

    const writeResult =
      await storage.writePaidVoteFulfillmentRecord(record);
    const readResult = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_123",
    );

    expect(writeResult.isOk()).toBe(true);
    expect(writeResult._unsafeUnwrap()).toEqual(record);
    expect(readResult.isOk()).toBe(true);
    expect(readResult._unsafeUnwrap()).toEqual(record);
    expect(client.set).toHaveBeenCalledWith(
      paidVoteFulfillmentKey("cs_test_123"),
      JSON.stringify(record),
    );
  });

  it("reads a pending paid vote fulfillment record", async () => {
    const record = {
      status: "pending" as const,
      checkoutSessionId: "cs_test_pending",
      countryCode: "DE",
      voteType: "dislike" as const,
    };
    const client = createClient({
      [paidVoteFulfillmentKey("cs_test_pending")]:
        JSON.stringify(record),
    });
    const storage = createStorageWithClient(client);

    const result = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_pending",
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual(record);
  });

  it("returns a typed not-found result for a missing fulfillment record", async () => {
    const client = createClient();
    const storage = createStorageWithClient(client);

    const result = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_missing",
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "not_found",
      checkoutSessionId: "cs_test_missing",
    });
  });

  it("returns a typed error for malformed stored fulfillment data", async () => {
    const client = createClient({
      [paidVoteFulfillmentKey("cs_test_bad")]:
        JSON.stringify({
          status: "applied",
          checkoutSessionId: "cs_test_bad",
          countryCode: "GB",
          voteType: "like",
          totals: {
            countryCode: "GB",
            likes: "not-a-number",
            dislikes: 3,
          },
        }),
    });
    const storage = createStorageWithClient(client);

    const result = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_bad",
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "malformed_paid_vote_fulfillment",
      checkoutSessionId: "cs_test_bad",
    });
  });

  it("returns Redis command failures as typed result errors", async () => {
    const paymentLogger = createMockLogger();
    const commandError = new Error("redis get failed");
    const client = createClient(
      {},
      {
        get: () => Promise.reject(commandError),
      },
    );
    const storage = createStorageWithClient(client, paymentLogger);

    const result = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_redis_failure",
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "redis_command_failed",
      message:
        "Failed to read paid vote fulfillment record from Redis.",
      cause: commandError,
    });
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        action: "read_paid_vote_fulfillment_record",
        errorCode: "redis_command_failed",
        checkoutSessionId: "cs_test_redis_failure",
      },
      "Failed to read paid vote fulfillment record.",
    );
  });

  it("returns Redis connection failures as typed result errors", async () => {
    const connectionError = new Error("redis connect failed");
    const client = createClient(
      {},
      {
        connect: () => Promise.reject(connectionError),
      },
    );
    const storage = createStorageWithClient(client);

    const result = await storage.readPaidVoteFulfillmentRecord(
      "cs_test_connection_failure",
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_connection_failed",
      cause: connectionError,
    });
  });
});
