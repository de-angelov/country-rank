import { createClient } from "redis";
import {
  err,
  errAsync,
  ok,
  ResultAsync,
  type Result,
} from "neverthrow";

const redisUrlEnvVar = "REDIS_URL";
const countryCodePattern = /^[A-Z]{2}$/;

export const countryCatalogKey = "country:catalog";
export const unknownCountryCapital = "Unknown";

export type CountryCatalogProfile = Readonly<{
  code: string;
  name: string;
  capital: string;
  factSnippet: string;
  flagImageUrl: string;
}>;

export type RedisCountryCatalogConfig = Readonly<{
  url: string;
}>;

export type RedisCountryCatalogError =
  | Readonly<{
      code: "missing_redis_config";
      message: string;
      envVar: typeof redisUrlEnvVar;
    }>
  | Readonly<{
      code: "redis_connection_failed" | "redis_command_failed";
      message: string;
      cause: unknown;
    }>
  | Readonly<{
      code: "missing_country_catalog";
      message: string;
      key: typeof countryCatalogKey;
    }>
  | Readonly<{
      code: "malformed_country_catalog";
      message: string;
      key: typeof countryCatalogKey;
      cause: unknown;
    }>
  | Readonly<{
      code: "invalid_country_catalog";
      message: string;
      key: typeof countryCatalogKey;
      issues: readonly string[];
    }>;

type RedisCountryCatalogClient = {
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
};

type RedisCountryCatalogClientFactory = (
  config: RedisCountryCatalogConfig,
) => RedisCountryCatalogClient;

export type RedisCountryCatalogOptions = Readonly<{
  env?: NodeJS.ProcessEnv;
  clientFactory?: RedisCountryCatalogClientFactory;
}>;

const createDefaultRedisCountryCatalogClient: RedisCountryCatalogClientFactory = (
  config,
) => createClient({ url: config.url }) as RedisCountryCatalogClient;

export const getRedisCountryCatalogConfig = (
  env: NodeJS.ProcessEnv = process.env,
): Result<RedisCountryCatalogConfig, RedisCountryCatalogError> => {
  const url = env[redisUrlEnvVar]?.trim();

  if (!url) {
    return err({
      code: "missing_redis_config",
      message: `${redisUrlEnvVar} must be set to read the country catalog.`,
      envVar: redisUrlEnvVar,
    });
  }

  return ok({ url });
};

const parseCountryCatalogJson = (
  catalogJson: string,
): Result<unknown, RedisCountryCatalogError> => {
  try {
    return ok(JSON.parse(catalogJson));
  } catch (cause) {
    return err({
      code: "malformed_country_catalog",
      message: "Redis country catalog must be valid JSON.",
      key: countryCatalogKey,
      cause,
    });
  }
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const profileIssuePrefix = (index: number) => `catalog[${index}]`;

const validateCountryCatalog = (
  catalog: unknown,
): Result<readonly CountryCatalogProfile[], RedisCountryCatalogError> => {
  if (!Array.isArray(catalog)) {
    return err({
      code: "invalid_country_catalog",
      message: "Redis country catalog must be an array of country profiles.",
      key: countryCatalogKey,
      issues: ["catalog must be an array"],
    });
  }

  const issues: string[] = [];
  const seenCodes = new Set<string>();
  const profiles: CountryCatalogProfile[] = [];

  catalog.forEach((record, index) => {
    const prefix = profileIssuePrefix(index);

    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      issues.push(`${prefix} must be an object`);
      return;
    }

    const fields = record as Record<string, unknown>;
    const code = fields.code;
    const name = fields.name;
    const capital = fields.capital;
    const factSnippet = fields.factSnippet;
    const flagImageUrl = fields.flagImageUrl;

    if (!isNonEmptyString(code) || !countryCodePattern.test(code)) {
      issues.push(`${prefix}.code must be an uppercase two-letter country code`);
    } else if (seenCodes.has(code)) {
      issues.push(`${prefix}.code must be unique`);
    } else {
      seenCodes.add(code);
    }

    if (!isNonEmptyString(name)) {
      issues.push(`${prefix}.name must be a non-empty string`);
    }

    if (
      !isNonEmptyString(capital) &&
      capital !== unknownCountryCapital
    ) {
      issues.push(
        `${prefix}.capital must be a non-empty string or ${unknownCountryCapital}`,
      );
    }

    if (!isNonEmptyString(factSnippet)) {
      issues.push(`${prefix}.factSnippet must be a non-empty string`);
    }

    if (!isNonEmptyString(flagImageUrl) || !isHttpsUrl(flagImageUrl)) {
      issues.push(`${prefix}.flagImageUrl must be an HTTPS URL`);
    }

    if (
      isNonEmptyString(code) &&
      countryCodePattern.test(code) &&
      isNonEmptyString(name) &&
      isNonEmptyString(capital) &&
      isNonEmptyString(factSnippet) &&
      isNonEmptyString(flagImageUrl) &&
      isHttpsUrl(flagImageUrl)
    ) {
      profiles.push({
        code,
        name: name.trim(),
        capital: capital.trim(),
        factSnippet: factSnippet.trim(),
        flagImageUrl: flagImageUrl.trim(),
      });
    }
  });

  if (issues.length > 0) {
    return err({
      code: "invalid_country_catalog",
      message: "Redis country catalog contains invalid country profiles.",
      key: countryCatalogKey,
      issues,
    });
  }

  return ok(profiles);
};

export const createRedisCountryCatalogReader = (
  options: RedisCountryCatalogOptions = {},
) => {
  const env = options.env ?? process.env;
  const clientFactory =
    options.clientFactory ?? createDefaultRedisCountryCatalogClient;
  let clientPromise: Promise<RedisCountryCatalogClient> | undefined;

  const getClient = (): ResultAsync<
    RedisCountryCatalogClient,
    RedisCountryCatalogError
  > => {
    const configResult = getRedisCountryCatalogConfig(env);

    if (configResult.isErr()) {
      return errAsync(configResult.error);
    }

    if (!clientPromise) {
      const client = clientFactory(configResult.value);

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
      message: "Failed to connect to Redis country catalog storage.",
      cause,
    }));
  };

  const readCountryCatalog = (): ResultAsync<
    readonly CountryCatalogProfile[],
    RedisCountryCatalogError
  > =>
    getClient()
      .andThen((client) =>
        ResultAsync.fromPromise(client.get(countryCatalogKey), (cause) => ({
          code: "redis_command_failed",
          message: "Failed to read country catalog from Redis.",
          cause,
        })),
      )
      .andThen((catalogJson) => {
        if (catalogJson === null) {
          return errAsync({
            code: "missing_country_catalog",
            message: "Redis country catalog is missing.",
            key: countryCatalogKey,
          });
        }

        return ResultAsync.fromSafePromise(
          Promise.resolve(parseCountryCatalogJson(catalogJson)),
        ).andThen((parseResult) =>
          parseResult.andThen(validateCountryCatalog),
        );
      });

  return {
    readCountryCatalog,
  };
};

export const { readCountryCatalog } = createRedisCountryCatalogReader();
