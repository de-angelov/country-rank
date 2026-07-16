import { describe, expect, it, vi } from "vitest";

import { createPaidVoteApplication } from "./paid-application.server";
import {
  createRedisVoteStorage,
  voteTotalsKey,
  type RedisVoteStorageConfig,
} from "./storage.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const createClient = (
  initialFields: Record<string, string> = {},
  options: Partial<{
    hIncrBy: (
      key: string,
      field: string,
      increment: number,
    ) => Promise<number>;
  }> = {},
) => {
  const fields = { ...initialFields };
  const client = {
    connect: vi.fn(() => Promise.resolve()),
    hGetAll: vi.fn(() => Promise.resolve({ ...fields })),
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

const createApplicationWithClient = (
  client: ReturnType<typeof createClient>,
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
  });
};

describe("createPaidVoteApplication", () => {
  it("applies a valid paid like vote to only the like total", async () => {
    const client = createClient({ likes: "4", dislikes: "9" });
    const application = createApplicationWithClient(client);

    const result = await application.applyPaidVote({
      countryCode: "JP",
      voteType: "like",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "applied",
      countryCode: "JP",
      voteType: "like",
      totals: {
        countryCode: "JP",
        likes: 5,
        dislikes: 9,
      },
    });
    expect(client.hIncrBy).toHaveBeenCalledWith(
      voteTotalsKey("JP"),
      "likes",
      1,
    );
  });

  it("applies a valid paid dislike vote to only the dislike total", async () => {
    const client = createClient({ likes: "3", dislikes: "6" });
    const application = createApplicationWithClient(client);

    const result = await application.applyPaidVote({
      countryCode: "DE",
      voteType: "dislike",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "applied",
      countryCode: "DE",
      voteType: "dislike",
      totals: {
        countryCode: "DE",
        likes: 3,
        dislikes: 7,
      },
    });
    expect(client.hIncrBy).toHaveBeenCalledWith(
      voteTotalsKey("DE"),
      "dislikes",
      1,
    );
  });

  it("returns a typed error when Redis fails to write the paid vote", async () => {
    const commandError = new Error("redis write failed");
    const client = createClient(
      {},
      {
        hIncrBy: () => Promise.reject(commandError),
      },
    );
    const application = createApplicationWithClient(client);

    const result = await application.applyPaidVote({
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
  });
});
