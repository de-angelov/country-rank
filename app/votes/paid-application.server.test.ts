import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import type { ApplicationLogger } from "~/lib/logger.server";
import { createPaidVoteApplication } from "./paid-application.server";
import type {
  PaidVoteFulfillmentRecord,
  RedisPaidVoteFulfillmentError,
} from "./fulfillment.server";
import {
  createRedisVoteStorage,
  voteTotalsKey,
  type RedisVoteStorageConfig,
} from "./storage.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const createClient = (
  initialFields: Partial<Record<"likes" | "dislikes", Record<string, string>>> = {},
  options: Partial<{
    hIncrBy: (
      key: string,
      field: string,
      increment: number,
    ) => Promise<number>;
  }> = {},
) => {
  const fields = {
    likes: { ...(initialFields.likes ?? {}) },
    dislikes: { ...(initialFields.dislikes ?? {}) },
  };
  const client = {
    connect: vi.fn(() => Promise.resolve()),
    hGet: vi.fn((key: string, field: string) => {
      const totals =
        key === voteTotalsKey("like") ? fields.likes : fields.dislikes;

      return Promise.resolve(totals[field] ?? null);
    }),
    hGetAll: vi.fn((key: string) =>
      Promise.resolve(
        key === voteTotalsKey("like") ? fields.likes : fields.dislikes,
      ),
    ),
    hIncrBy: vi.fn(
      options.hIncrBy ??
        ((_key: string, field: string, increment: number) => {
          const totals =
            _key === voteTotalsKey("like") ? fields.likes : fields.dislikes;
          totals[field] = String(Number(totals[field] ?? 0) + increment);

          return Promise.resolve(Number(totals[field]));
        }),
    ),
  };

  return client;
};

const createApplicationWithClient = (
  client: ReturnType<typeof createClient>,
  writeFulfillmentRecord = vi.fn((record: PaidVoteFulfillmentRecord) =>
    okAsync(record),
  ),
) => {
  const storage = createRedisVoteStorage({
    env: envWithRedisUrl,
    clientFactory: (config: RedisVoteStorageConfig) => {
      expect(config.url).toBe(envWithRedisUrl.REDIS_URL);

      return client;
    },
  });

  return createPaidVoteApplication({
    incrementVoteTotal: storage.incrementCountryVoteTotal,
    readFulfillmentRecord: () =>
      okAsync({
        status: "not_found",
        checkoutSessionId: "cs_test_missing",
      }),
    writeFulfillmentRecord,
  });
};

const createMockLogger = (): ApplicationLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("createPaidVoteApplication", () => {
  it("applies a valid paid like vote to only the like total", async () => {
    const client = createClient({
      likes: { JP: "4" },
      dislikes: { JP: "9" },
    });
    const writeFulfillmentRecord = vi.fn(
      (record: PaidVoteFulfillmentRecord) => okAsync(record),
    );
    const application = createApplicationWithClient(
      client,
      writeFulfillmentRecord,
    );

    const result = await application.applyPaidVote({
      checkoutSessionId: "cs_test_like",
      countryCode: "JP",
      voteType: "like",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "applied",
      checkoutSessionId: "cs_test_like",
      countryCode: "JP",
      voteType: "like",
      totals: {
        countryCode: "JP",
        likes: 5,
        dislikes: 9,
      },
    });
    expect(client.hIncrBy).toHaveBeenCalledWith(
      voteTotalsKey("like"),
      "JP",
      1,
    );
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "applied",
      checkoutSessionId: "cs_test_like",
      countryCode: "JP",
      voteType: "like",
      totals: {
        countryCode: "JP",
        likes: 5,
        dislikes: 9,
      },
    });
  });

  it("applies a valid paid dislike vote to only the dislike total", async () => {
    const client = createClient({
      likes: { DE: "3" },
      dislikes: { DE: "6" },
    });
    const writeFulfillmentRecord = vi.fn(
      (record: PaidVoteFulfillmentRecord) => okAsync(record),
    );
    const application = createApplicationWithClient(
      client,
      writeFulfillmentRecord,
    );

    const result = await application.applyPaidVote({
      checkoutSessionId: "cs_test_dislike",
      countryCode: "DE",
      voteType: "dislike",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "applied",
      checkoutSessionId: "cs_test_dislike",
      countryCode: "DE",
      voteType: "dislike",
      totals: {
        countryCode: "DE",
        likes: 3,
        dislikes: 7,
      },
    });
    expect(client.hIncrBy).toHaveBeenCalledWith(
      voteTotalsKey("dislike"),
      "DE",
      1,
    );
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "applied",
      checkoutSessionId: "cs_test_dislike",
      countryCode: "DE",
      voteType: "dislike",
      totals: {
        countryCode: "DE",
        likes: 3,
        dislikes: 7,
      },
    });
  });

  it("returns a typed error when Redis fails to write the paid vote", async () => {
    const paymentLogger = createMockLogger();
    const commandError = new Error("redis write failed");
    const client = createClient(
      {},
      {
        hIncrBy: () => Promise.reject(commandError),
      },
    );
    const writeFulfillmentRecord = vi.fn(
      (record: PaidVoteFulfillmentRecord) => okAsync(record),
    );
    const applicationWithLogger = createPaidVoteApplication({
      incrementVoteTotal: createRedisVoteStorage({
        env: envWithRedisUrl,
        clientFactory: () => client,
      }).incrementCountryVoteTotal,
      readFulfillmentRecord: () =>
        okAsync({
          status: "not_found",
          checkoutSessionId: "cs_test_missing",
        }),
      writeFulfillmentRecord,
      logger: paymentLogger,
    });

    const result = await applicationWithLogger.applyPaidVote({
      checkoutSessionId: "cs_test_write_failure",
      countryCode: "CA",
      voteType: "like",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "paid_vote_application_failed",
      message: "Failed to apply paid vote to Redis totals.",
      cause: {
        code: "redis_command_failed",
        message: "Failed to increment country vote total in Redis.",
        cause: commandError,
      },
    });
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        action: "apply_paid_vote_total",
        errorCode: "paid_vote_application_failed",
        causeCode: "redis_command_failed",
        checkoutSessionId: "cs_test_write_failure",
        countryCode: "CA",
        voteType: "like",
      },
      "Failed to apply paid vote to Redis totals.",
    );
  });

  it("returns a typed error when fulfillment cannot be recorded after applying the vote", async () => {
    const client = createClient({
      likes: { BR: "8" },
      dislikes: { BR: "2" },
    });
    const fulfillmentError: RedisPaidVoteFulfillmentError = {
      code: "redis_command_failed",
      message: "Failed to write paid vote fulfillment record to Redis.",
      cause: new Error("redis set failed"),
    };
    const writeFulfillmentRecord = vi.fn(() =>
      errAsync(fulfillmentError),
    );
    const application = createApplicationWithClient(
      client,
      writeFulfillmentRecord,
    );

    const result = await application.applyPaidVote({
      checkoutSessionId: "cs_test_fulfillment_write_failure",
      countryCode: "BR",
      voteType: "like",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "paid_vote_fulfillment_write_failed",
      message: "Failed to write paid vote fulfillment after applying vote.",
      checkoutSessionId: "cs_test_fulfillment_write_failure",
      cause: fulfillmentError,
    });
    expect(client.hIncrBy).toHaveBeenCalledWith(
      voteTotalsKey("like"),
      "BR",
      1,
    );
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "applied",
      checkoutSessionId: "cs_test_fulfillment_write_failure",
      countryCode: "BR",
      voteType: "like",
      totals: {
        countryCode: "BR",
        likes: 9,
        dislikes: 2,
      },
    });
  });

  it("skips applying a paid vote when the fulfillment record is already applied", async () => {
    const paymentLogger = createMockLogger();
    const client = createClient({
      likes: { JP: "4" },
      dislikes: { JP: "9" },
    });
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "applied" as const,
        checkoutSessionId: "cs_test_duplicate",
        countryCode: "JP",
        voteType: "like" as const,
        totals: {
          countryCode: "JP",
          likes: 4,
          dislikes: 9,
        },
      }),
    );
    const writeFulfillmentRecord = vi.fn(
      (record: PaidVoteFulfillmentRecord) => okAsync(record),
    );
    const storage = createRedisVoteStorage({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });
    const application = createPaidVoteApplication({
      incrementVoteTotal: storage.incrementCountryVoteTotal,
      readFulfillmentRecord,
      writeFulfillmentRecord,
      logger: paymentLogger,
    });

    const result = await application.applyPaidVote({
      checkoutSessionId: "cs_test_duplicate",
      countryCode: "JP",
      voteType: "like",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "duplicate",
      checkoutSessionId: "cs_test_duplicate",
      countryCode: "JP",
      voteType: "like",
      totals: {
        countryCode: "JP",
        likes: 4,
        dislikes: 9,
      },
    });
    expect(readFulfillmentRecord).toHaveBeenCalledWith("cs_test_duplicate");
    expect(client.hIncrBy).not.toHaveBeenCalled();
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
    expect(paymentLogger.info).toHaveBeenCalledWith(
      {
        action: "skip_duplicate_paid_vote",
        checkoutSessionId: "cs_test_duplicate",
        countryCode: "JP",
        voteType: "like",
      },
      "Skipped duplicate paid vote fulfillment.",
    );
  });

  it("returns a typed error before applying when fulfillment lookup fails", async () => {
    const client = createClient({
      likes: { JP: "4" },
      dislikes: { JP: "9" },
    });
    const fulfillmentError: RedisPaidVoteFulfillmentError = {
      code: "redis_command_failed",
      message: "Failed to read paid vote fulfillment record from Redis.",
      cause: new Error("redis get failed"),
    };
    const application = createPaidVoteApplication({
      incrementVoteTotal: createRedisVoteStorage({
        env: envWithRedisUrl,
        clientFactory: () => client,
      }).incrementCountryVoteTotal,
      readFulfillmentRecord: () => errAsync(fulfillmentError),
      writeFulfillmentRecord: vi.fn((record: PaidVoteFulfillmentRecord) =>
        okAsync(record),
      ),
    });

    const result = await application.applyPaidVote({
      checkoutSessionId: "cs_test_read_failure",
      countryCode: "JP",
      voteType: "like",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "paid_vote_fulfillment_read_failed",
      message: "Failed to read paid vote fulfillment before applying vote.",
      checkoutSessionId: "cs_test_read_failure",
      cause: fulfillmentError,
    });
    expect(client.hIncrBy).not.toHaveBeenCalled();
  });
});
