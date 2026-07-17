import { err, errAsync, ok, ResultAsync, type Result } from "neverthrow";
import { createClient } from "redis";

export const redisUrlEnvVar = "REDIS_URL";

export type RedisConfig = Readonly<{
  url: string;
}>;

export type RedisConfigurationError = Readonly<{
  code: "missing_redis_config";
  message: string;
  envVar: typeof redisUrlEnvVar;
}>;

export type RedisConnectionFailure = Readonly<{
  code: "redis_connection_failed";
  message: string;
  cause: unknown;
}>;

export type RedisConnectionError =
  | RedisConfigurationError
  | RedisConnectionFailure;

export type RedisConnectableClient = {
  connect: () => Promise<unknown>;
};

export type RedisClientFactory<Client extends RedisConnectableClient> = (
  config: RedisConfig,
) => Client;

export type RedisClientProviderOptions<
  Client extends RedisConnectableClient,
> = Readonly<{
  env?: NodeJS.ProcessEnv;
  clientFactory: RedisClientFactory<Client>;
  missingConfigMessage: string;
  connectionFailureMessage: string;
}>;

export const createDefaultRedisClient = (config: RedisConfig) =>
  createClient({ url: config.url }) as RedisConnectableClient;

export const getRedisConfig = (
  env: NodeJS.ProcessEnv = process.env,
  message = `${redisUrlEnvVar} must be set to connect to Redis.`,
): Result<RedisConfig, RedisConfigurationError> => {
  const url = env[redisUrlEnvVar]?.trim();

  if (!url) {
    return err({
      code: "missing_redis_config",
      message,
      envVar: redisUrlEnvVar,
    });
  }

  return ok({ url });
};

export const createRedisClientProvider = <
  Client extends RedisConnectableClient,
>(
  options: RedisClientProviderOptions<Client>,
) => {
  const env = options.env ?? process.env;
  let clientPromise: Promise<Client> | undefined;

  return (): ResultAsync<Client, RedisConnectionError> => {
    if (!clientPromise) {
      const configResult = getRedisConfig(
        env,
        options.missingConfigMessage,
      );

      if (configResult.isErr()) {
        return errAsync(configResult.error);
      }

      const client = options.clientFactory(configResult.value);

      clientPromise = client.connect().then(
        () => client,
        (cause: unknown) => {
          clientPromise = undefined;
          throw cause;
        },
      );
    }

    return ResultAsync.fromPromise(clientPromise, (cause) => ({
      code: "redis_connection_failed",
      message: options.connectionFailureMessage,
      cause,
    }));
  };
};
