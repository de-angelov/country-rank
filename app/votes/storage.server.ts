import {
  errAsync,
  ResultAsync,
} from "neverthrow";
import {
  createDefaultRedisClient,
  createRedisClientProvider,
  getRedisConfig,
  redisUrlEnvVar,
  type RedisClientFactory,
  type RedisConfig,
} from "~/lib/redis.server";

const countryCodePattern = /^[A-Z]{2}$/;

export type VoteKind = "like" | "dislike";

export type VoteTotals = Readonly<{
  countryCode: string;
  likes: number;
  dislikes: number;
}>;

export type RedisVoteStorageConfig = RedisConfig;

export type RedisVoteStorageError =
  | Readonly<{
      code: "missing_redis_config";
      message: string;
      envVar: typeof redisUrlEnvVar;
    }>
  | Readonly<{
      code: "invalid_country_code";
      message: string;
      countryCode: string;
    }>
  | Readonly<{
      code: "redis_connection_failed" | "redis_command_failed";
      message: string;
      cause: unknown;
    }>;

type RedisVoteClient = {
  connect: () => Promise<unknown>;
  hGetAll: (key: string) => Promise<Record<string, string>>;
  hIncrBy: (key: string, field: string, increment: number) => Promise<number>;
};

type RedisVoteClientFactory = RedisClientFactory<RedisVoteClient>;

export type RedisVoteStorageOptions = Readonly<{
  env?: NodeJS.ProcessEnv;
  clientFactory?: RedisVoteClientFactory;
}>;

const createDefaultRedisVoteClient: RedisVoteClientFactory = (config) =>
  createDefaultRedisClient(config) as RedisVoteClient;

export const getRedisVoteStorageConfig = (
  env: NodeJS.ProcessEnv = process.env,
) =>
  getRedisConfig(
    env,
    `${redisUrlEnvVar} must be set to read or write vote totals.`,
  );

export const voteTotalsKey = (countryCode: string) =>
  `country:votes:${countryCode}`;

export const createRedisVoteStorage = (
  options: RedisVoteStorageOptions = {},
) => {
  const env = options.env ?? process.env;
  const clientFactory = options.clientFactory ?? createDefaultRedisVoteClient;
  const getClient = createRedisClientProvider({
    env,
    clientFactory,
    missingConfigMessage: `${redisUrlEnvVar} must be set to read or write vote totals.`,
    connectionFailureMessage: "Failed to connect to Redis vote storage.",
  });

  const withValidCountryCode = <Value>(
    countryCode: string,
    fn: (countryCode: string) => ResultAsync<Value, RedisVoteStorageError>,
  ): ResultAsync<Value, RedisVoteStorageError> => {
    const normalizedCountryCode = countryCode.trim().toUpperCase();

    if (!countryCodePattern.test(normalizedCountryCode)) {
      return errAsync({
        code: "invalid_country_code",
        message: "Country code must be a two-letter ISO country code.",
        countryCode,
      });
    }

    return fn(normalizedCountryCode);
  };

  const readCountryVoteTotals = (
    countryCode: string,
  ): ResultAsync<VoteTotals, RedisVoteStorageError> =>
    withValidCountryCode(countryCode, (normalizedCountryCode) =>
      getClient().andThen((client) =>
        ResultAsync.fromPromise(
          client.hGetAll(voteTotalsKey(normalizedCountryCode)),
          (cause) => ({
            code: "redis_command_failed",
            message: "Failed to read country vote totals from Redis.",
            cause,
          }),
        ).map((fields) => ({
          countryCode: normalizedCountryCode,
          likes: Number(fields.likes ?? 0),
          dislikes: Number(fields.dislikes ?? 0),
        })),
      ),
    );

  const incrementCountryVoteTotal = (
    countryCode: string,
    voteKind: VoteKind,
  ): ResultAsync<VoteTotals, RedisVoteStorageError> =>
    withValidCountryCode(countryCode, (normalizedCountryCode) =>
      getClient()
        .andThen((client) =>
          ResultAsync.fromPromise(
            client.hIncrBy(
              voteTotalsKey(normalizedCountryCode),
              voteKind === "like" ? "likes" : "dislikes",
              1,
            ),
            (cause) => ({
              code: "redis_command_failed",
              message: "Failed to increment country vote total in Redis.",
              cause,
            }),
          ),
        )
        .andThen(() => readCountryVoteTotals(normalizedCountryCode)),
    );

  return {
    readCountryVoteTotals,
    incrementCountryVoteTotal,
  };
};

export const {
  readCountryVoteTotals,
  incrementCountryVoteTotal,
} = createRedisVoteStorage();
