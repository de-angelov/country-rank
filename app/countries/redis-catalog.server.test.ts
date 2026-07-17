import { describe, expect, it, vi } from "vitest";

import {
  countryCatalogKey,
  createRedisCountryCatalogReader,
  getRedisCountryCatalogConfig,
  type RedisCountryCatalogConfig,
} from "./redis-catalog.server";

const envWithRedisUrl = {
  REDIS_URL: "redis://localhost:6379",
};

const catalogRecords = [
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    factSnippet: "Vending machines, bullet trains, and stationery.",
    flagImageUrl: "https://example.com/jp.svg",
    likes: 11,
    dislikes: 1,
  },
  {
    code: "VA",
    name: "Vatican City",
    capital: "Unknown",
    factSnippet: "Tiny country profile with an explicit unknown capital fallback.",
    flagImageUrl: "https://example.com/va.svg",
  },
];

const createClient = (
  catalogJson: string | null,
  options: Partial<{
    connect: () => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
  }> = {},
) => ({
  connect: vi.fn(options.connect ?? (() => Promise.resolve())),
  get: vi.fn(options.get ?? (() => Promise.resolve(catalogJson))),
});

describe("getRedisCountryCatalogConfig", () => {
  it("returns a clear error when Redis configuration is missing", () => {
    const result = getRedisCountryCatalogConfig({});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "missing_redis_config",
      envVar: "REDIS_URL",
    });
  });
});

describe("createRedisCountryCatalogReader", () => {
  it("reads validated country profiles from Redis", async () => {
    const client = createClient(JSON.stringify(catalogRecords));
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: (config: RedisCountryCatalogConfig) => {
        expect(config.url).toBe(envWithRedisUrl.REDIS_URL);

        return client;
      },
    });

    const result = await reader.readCountryCatalog();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        code: "JP",
        name: "Japan",
        capital: "Tokyo",
        factSnippet: "Vending machines, bullet trains, and stationery.",
        flagImageUrl: "https://example.com/jp.svg",
      },
      {
        code: "VA",
        name: "Vatican City",
        capital: "Unknown",
        factSnippet: "Tiny country profile with an explicit unknown capital fallback.",
        flagImageUrl: "https://example.com/va.svg",
      },
    ]);
    expect(client.get).toHaveBeenCalledWith(countryCatalogKey);
  });

  it("returns a typed error when the catalog is missing", async () => {
    const client = createClient(null);
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await reader.readCountryCatalog();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "missing_country_catalog",
      key: countryCatalogKey,
    });
  });

  it("returns a typed error when the catalog JSON is malformed", async () => {
    const client = createClient("[");
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await reader.readCountryCatalog();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "malformed_country_catalog",
      key: countryCatalogKey,
    });
  });

  it("returns a typed error when catalog records are invalid", async () => {
    const client = createClient(
      JSON.stringify([
        {
          code: "jp",
          name: "",
          capital: "",
          factSnippet: " ",
          flagImageUrl: "http://example.com/jp.svg",
        },
        {
          code: "US",
          name: "United States",
          capital: "Washington, D.C.",
          factSnippet: "Test profile.",
          flagImageUrl: "https://example.com/us.svg",
        },
        {
          code: "US",
          name: "United States duplicate",
          capital: "Washington, D.C.",
          factSnippet: "Duplicate profile.",
          flagImageUrl: "https://example.com/us-duplicate.svg",
        },
      ]),
    );
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await reader.readCountryCatalog();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invalid_country_catalog",
      key: countryCatalogKey,
      issues: expect.arrayContaining([
        "catalog[0].code must be an uppercase two-letter country code",
        "catalog[0].name must be a non-empty string",
        "catalog[0].capital must be a non-empty string or Unknown",
        "catalog[0].factSnippet must be a non-empty string",
        "catalog[0].flagImageUrl must be an HTTPS URL",
        "catalog[2].code must be unique",
      ]),
    });
  });

  it("returns Redis connection failures as result errors", async () => {
    const connectionError = new Error("refused");
    const client = createClient(
      JSON.stringify(catalogRecords),
      {
        connect: () => Promise.reject(connectionError),
      },
    );
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await reader.readCountryCatalog();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_connection_failed",
      cause: connectionError,
    });
  });

  it("returns Redis command failures as result errors", async () => {
    const commandError = new Error("read failed");
    const client = createClient(
      JSON.stringify(catalogRecords),
      {
        get: () => Promise.reject(commandError),
      },
    );
    const reader = createRedisCountryCatalogReader({
      env: envWithRedisUrl,
      clientFactory: () => client,
    });

    const result = await reader.readCountryCatalog();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "redis_command_failed",
      cause: commandError,
    });
  });
});
