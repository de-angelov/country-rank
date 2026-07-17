import {
  err,
  errAsync,
  ok,
  okAsync,
  ResultAsync,
  type Result,
} from "neverthrow";

import { logger, type ApplicationLogger } from "~/lib/logger.server";
import {
  createDefaultRedisClient,
  createRedisClientProvider,
  redisUrlEnvVar,
  type RedisClientFactory,
  type RedisConfig,
} from "~/lib/redis.server";
import type { VoteKind, VoteTotals } from "./storage.server";

export type PaidVoteFulfillmentRecord =
  | Readonly<{
      status: "pending";
      checkoutSessionId: string;
      countryCode: string;
      voteType: VoteKind;
    }>
  | Readonly<{
      status: "applied";
      checkoutSessionId: string;
      countryCode: string;
      voteType: VoteKind;
      totals?: VoteTotals;
    }>;

export type PaidVoteFulfillmentReadResult =
  | PaidVoteFulfillmentRecord
  | Readonly<{
      status: "not_found";
      checkoutSessionId: string;
    }>;

export type RedisPaidVoteFulfillmentConfig = RedisConfig;

export type RedisPaidVoteFulfillmentError =
  | Readonly<{
      code: "missing_redis_config";
      message: string;
      envVar: typeof redisUrlEnvVar;
    }>
  | Readonly<{
      code: "malformed_paid_vote_fulfillment";
      message: string;
      checkoutSessionId: string;
      cause: unknown;
    }>
  | Readonly<{
      code: "redis_connection_failed" | "redis_command_failed";
      message: string;
      cause: unknown;
    }>;

type RedisPaidVoteFulfillmentClient = {
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
};

type RedisPaidVoteFulfillmentClientFactory =
  RedisClientFactory<RedisPaidVoteFulfillmentClient>;

export type RedisPaidVoteFulfillmentOptions = Readonly<{
  env?: NodeJS.ProcessEnv;
  clientFactory?: RedisPaidVoteFulfillmentClientFactory;
  logger?: ApplicationLogger;
}>;

const createDefaultRedisPaidVoteFulfillmentClient: RedisPaidVoteFulfillmentClientFactory =
  (config) => createDefaultRedisClient(config) as RedisPaidVoteFulfillmentClient;

export const paidVoteFulfillmentKey = (checkoutSessionId: string) =>
  `paid-vote:fulfillment:${checkoutSessionId}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isVoteKind = (value: unknown): value is VoteKind =>
  value === "like" || value === "dislike";

const isVoteTotals = (value: unknown): value is VoteTotals =>
  isRecord(value) &&
  typeof value.countryCode === "string" &&
  typeof value.likes === "number" &&
  Number.isFinite(value.likes) &&
  typeof value.dislikes === "number" &&
  Number.isFinite(value.dislikes);

const parseStoredRecord = (
  checkoutSessionId: string,
  storedValue: string | null,
): Result<PaidVoteFulfillmentReadResult, RedisPaidVoteFulfillmentError> => {
  if (storedValue === null) {
    return ok({
      status: "not_found",
      checkoutSessionId,
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(storedValue);
  } catch (cause) {
    return err({
      code: "malformed_paid_vote_fulfillment",
      message: "Paid vote fulfillment record stored in Redis is malformed.",
      checkoutSessionId,
      cause,
    });
  }

  if (
    !isRecord(parsed) ||
    parsed.checkoutSessionId !== checkoutSessionId ||
    typeof parsed.countryCode !== "string" ||
    !isVoteKind(parsed.voteType) ||
    (parsed.status !== "pending" && parsed.status !== "applied")
  ) {
    return err({
      code: "malformed_paid_vote_fulfillment",
      message: "Paid vote fulfillment record stored in Redis is malformed.",
      checkoutSessionId,
      cause: parsed,
    });
  }

  const baseRecord = {
    checkoutSessionId,
    countryCode: parsed.countryCode,
    voteType: parsed.voteType,
  };

  if (parsed.status === "pending") {
    return ok({
      status: "pending",
      ...baseRecord,
    });
  }

  if (parsed.totals !== undefined && !isVoteTotals(parsed.totals)) {
    return err({
      code: "malformed_paid_vote_fulfillment",
      message: "Paid vote fulfillment record stored in Redis is malformed.",
      checkoutSessionId,
      cause: parsed,
    });
  }

  return ok({
    status: "applied",
    ...baseRecord,
    ...(parsed.totals === undefined ? {} : { totals: parsed.totals }),
  });
};

export const createRedisPaidVoteFulfillmentStorage = (
  options: RedisPaidVoteFulfillmentOptions = {},
) => {
  const env = options.env ?? process.env;
  const paymentLogger = options.logger ?? logger;
  const clientFactory =
    options.clientFactory ?? createDefaultRedisPaidVoteFulfillmentClient;
  const getClient = createRedisClientProvider({
    env,
    clientFactory,
    missingConfigMessage: `${redisUrlEnvVar} must be set to read or write paid vote fulfillment records.`,
    connectionFailureMessage:
      "Failed to connect to Redis paid vote fulfillment storage.",
  });

  const writePaidVoteFulfillmentRecord = (
    record: PaidVoteFulfillmentRecord,
  ): ResultAsync<PaidVoteFulfillmentRecord, RedisPaidVoteFulfillmentError> =>
    getClient()
      .andThen((client) =>
        ResultAsync.fromPromise(
          client.set(
            paidVoteFulfillmentKey(record.checkoutSessionId),
            JSON.stringify(record),
          ),
          (cause) => ({
            code: "redis_command_failed",
            message:
              "Failed to write paid vote fulfillment record to Redis.",
            cause,
          }),
        ),
      )
      .mapErr((error) => {
        paymentLogger.error(
          {
            action: "write_paid_vote_fulfillment_record",
            errorCode: error.code,
            checkoutSessionId: record.checkoutSessionId,
            countryCode: record.countryCode,
            voteType: record.voteType,
          },
          "Failed to write paid vote fulfillment record.",
        );

        return error;
      })
      .map(() => record);

  const readPaidVoteFulfillmentRecord = (
    checkoutSessionId: string,
  ): ResultAsync<
    PaidVoteFulfillmentReadResult,
    RedisPaidVoteFulfillmentError
  > =>
    getClient()
      .andThen((client) =>
        ResultAsync.fromPromise(
          client.get(paidVoteFulfillmentKey(checkoutSessionId)),
          (cause) => ({
            code: "redis_command_failed",
            message:
              "Failed to read paid vote fulfillment record from Redis.",
            cause,
          }),
        ),
      )
      .andThen((storedValue) =>
        parseStoredRecord(checkoutSessionId, storedValue).match(
          (record) => okAsync(record),
          (error) => errAsync(error),
        ),
      )
      .mapErr((error) => {
        paymentLogger.error(
          {
            action: "read_paid_vote_fulfillment_record",
            errorCode: error.code,
            checkoutSessionId,
          },
          "Failed to read paid vote fulfillment record.",
        );

        return error;
      });

  return {
    writePaidVoteFulfillmentRecord,
    readPaidVoteFulfillmentRecord,
  };
};

export const {
  writePaidVoteFulfillmentRecord,
  readPaidVoteFulfillmentRecord,
} = createRedisPaidVoteFulfillmentStorage();
