import { ResultAsync } from "neverthrow";

import {
  createDefaultRedisClient,
  createRedisClientProvider,
  redisUrlEnvVar,
  type RedisClientFactory,
  type RedisConnectableClient,
  type RedisConnectionError,
} from "~/lib/redis.server";

type RedisReadinessClient = RedisConnectableClient & {
  ping: () => Promise<unknown>;
};

type RedisReadinessError =
  | RedisConnectionError
  | Readonly<{
      code: "redis_command_failed";
      message: string;
      cause: unknown;
    }>;

type RedisReadinessOptions = Readonly<{
  env?: NodeJS.ProcessEnv;
  clientFactory?: RedisClientFactory<RedisReadinessClient>;
}>;

const createDefaultRedisReadinessClient: RedisClientFactory<
  RedisReadinessClient
> = (config) => createDefaultRedisClient(config) as RedisReadinessClient;

export const checkRedisReadiness = (
  options: RedisReadinessOptions = {},
): ResultAsync<"ready", RedisReadinessError> => {
  const getClient = createRedisClientProvider({
    env: options.env,
    clientFactory:
      options.clientFactory ?? createDefaultRedisReadinessClient,
    missingConfigMessage: `${redisUrlEnvVar} must be set for readiness checks.`,
    connectionFailureMessage: "Failed to connect to Redis for readiness checks.",
  });

  return getClient().andThen((client) =>
    ResultAsync.fromPromise(client.ping(), (cause) => ({
      code: "redis_command_failed",
      message: "Failed to ping Redis for readiness checks.",
      cause,
    })).map(() => "ready" as const),
  );
};

export const createReadyHandler =
  (options: RedisReadinessOptions = {}) =>
  async () => {
    const readinessResult = await checkRedisReadiness(options);

    if (readinessResult.isErr()) {
      return Response.json(
        {
          ok: false,
          status: "not_ready",
          error: toReadyResponseError(readinessResult.error),
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: true,
        status: "ready",
      },
      { status: 200 },
    );
  };

export const handleReady = createReadyHandler();

const toReadyResponseError = (error: RedisReadinessError) => ({
  code: error.code,
  message: error.message,
});
