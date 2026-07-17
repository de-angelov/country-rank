import {
  err,
  errAsync,
  ok,
  okAsync,
  ResultAsync,
  type Result,
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

export type VoteTotalsByCountry = ReadonlyMap<string, VoteTotals>;

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
      code: "malformed_vote_total";
      message: string;
      key: string;
      field: string;
      value: string;
    }>
  | Readonly<{
      code: "redis_connection_failed" | "redis_command_failed";
      message: string;
      cause: unknown;
    }>;

type RedisVoteClient = {
  connect: () => Promise<unknown>;
  hGet: (key: string, field: string) => Promise<string | null>;
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

export const voteTotalsKey = (voteKind: VoteKind) =>
  `country:votes:${voteKind === "like" ? "likes" : "dislikes"}`;

const validateStoredVoteTotal = (
  key: string,
  field: string,
  value: string | null,
): Result<number, RedisVoteStorageError> => {
  if (value === null) {
    return ok(0);
  }

  if (!/^\d+$/.test(value)) {
    return err({
      code: "malformed_vote_total",
      message:
        "Redis vote total hash values must be non-negative integer strings.",
      key,
      field,
      value,
    });
  }

  const total = Number(value);

  if (!Number.isSafeInteger(total)) {
    return err({
      code: "malformed_vote_total",
      message:
        "Redis vote total hash values must be non-negative integer strings.",
      key,
      field,
      value,
    });
  }

  return ok(total);
};

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
          Promise.all([
            client.hGet(voteTotalsKey("like"), normalizedCountryCode),
            client.hGet(voteTotalsKey("dislike"), normalizedCountryCode),
          ]),
          (cause) => ({
            code: "redis_command_failed",
            message: "Failed to read country vote totals from Redis.",
            cause,
          }),
        ).andThen(([likes, dislikes]) => {
          const likesResult = validateStoredVoteTotal(
            voteTotalsKey("like"),
            normalizedCountryCode,
            likes,
          );
          const dislikesResult = validateStoredVoteTotal(
            voteTotalsKey("dislike"),
            normalizedCountryCode,
            dislikes,
          );

          if (likesResult.isErr()) {
            return errAsync(likesResult.error);
          }

          if (dislikesResult.isErr()) {
            return errAsync(dislikesResult.error);
          }

          return okAsync({
            countryCode: normalizedCountryCode,
            likes: likesResult.value,
            dislikes: dislikesResult.value,
          });
        }),
      ),
    );

  const readAllCountryVoteTotals = (): ResultAsync<
    VoteTotalsByCountry,
    RedisVoteStorageError
  > =>
    getClient()
      .andThen((client) =>
        ResultAsync.fromPromise(
          Promise.all([
            client.hGetAll(voteTotalsKey("like")),
            client.hGetAll(voteTotalsKey("dislike")),
          ]),
          (cause) => ({
            code: "redis_command_failed",
            message: "Failed to read country vote totals from Redis.",
            cause,
          }),
        ),
      )
      .andThen(([likesByCountry, dislikesByCountry]) => {
        const countryCodes = new Set([
          ...Object.keys(likesByCountry),
          ...Object.keys(dislikesByCountry),
        ]);

        const totals: [string, VoteTotals][] = [];

        for (const countryCode of countryCodes) {
          const likesResult = validateStoredVoteTotal(
            voteTotalsKey("like"),
            countryCode,
            likesByCountry[countryCode] ?? null,
          );
          const dislikesResult = validateStoredVoteTotal(
            voteTotalsKey("dislike"),
            countryCode,
            dislikesByCountry[countryCode] ?? null,
          );

          if (likesResult.isErr()) {
            return errAsync(likesResult.error);
          }

          if (dislikesResult.isErr()) {
            return errAsync(dislikesResult.error);
          }

          totals.push([
            countryCode,
            {
              countryCode,
              likes: likesResult.value,
              dislikes: dislikesResult.value,
            },
          ]);
        }

        return okAsync(new Map(totals));
      });

  const incrementCountryVoteTotal = (
    countryCode: string,
    voteKind: VoteKind,
  ): ResultAsync<VoteTotals, RedisVoteStorageError> =>
    withValidCountryCode(countryCode, (normalizedCountryCode) =>
      getClient()
        .andThen((client) =>
          ResultAsync.fromPromise(
            client.hIncrBy(
              voteTotalsKey(voteKind),
              normalizedCountryCode,
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
    readAllCountryVoteTotals,
    readCountryVoteTotals,
    incrementCountryVoteTotal,
  };
};

export const {
  readAllCountryVoteTotals,
  readCountryVoteTotals,
  incrementCountryVoteTotal,
} = createRedisVoteStorage();
