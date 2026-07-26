import { describe, expect, it } from "vitest";

import {
  getServerEnv,
  parseServerEnv,
  ServerEnvValidationError,
} from "./server-env.server";

const validEnv = {
  REDIS_URL: "redis://localhost:6379",
  STRIPE_SECRET_KEY: "sk_test_validSecret123",
  STRIPE_WEBHOOK_SECRET: "whsec_validSecret123",
  LOG_LEVEL: "debug",
};

describe("parseServerEnv", () => {
  it("returns trimmed server config for a valid environment", () => {
    const result = parseServerEnv({
      REDIS_URL: " redis://localhost:6379 ",
      STRIPE_SECRET_KEY: " sk_live_validSecret123 ",
      STRIPE_WEBHOOK_SECRET: " whsec_validSecret123 ",
      LOG_LEVEL: " TRACE ",
    });

    expect(result.isOk()).toBe(true);

    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toEqual({
      REDIS_URL: "redis://localhost:6379",
      STRIPE_SECRET_KEY: "sk_live_validSecret123",
      STRIPE_WEBHOOK_SECRET: "whsec_validSecret123",
      LOG_LEVEL: "trace",
    });
  });

  it("requires paid voting config in every runtime mode", () => {
    const result = parseServerEnv({});

    expect(result.isErr()).toBe(true);

    if (result.isOk()) {
      throw new Error("Expected server env parsing to fail.");
    }

    expect(result.error.issues).toEqual([
      {
        envVar: "REDIS_URL",
        category: "missing",
        message: "REDIS_URL must be set.",
      },
      {
        envVar: "STRIPE_SECRET_KEY",
        category: "missing",
        message: "STRIPE_SECRET_KEY must be set.",
      },
      {
        envVar: "STRIPE_WEBHOOK_SECRET",
        category: "missing",
        message: "STRIPE_WEBHOOK_SECRET must be set.",
      },
    ]);
  });

  it("rejects malformed Redis and Stripe values", () => {
    const result = parseServerEnv({
      REDIS_URL: "https://localhost:6379",
      STRIPE_SECRET_KEY: "pk_test_publicKey",
      STRIPE_WEBHOOK_SECRET: "secret_without_whsec_prefix",
      LOG_LEVEL: "verbose",
    });

    expect(result.isErr()).toBe(true);

    if (result.isOk()) {
      throw new Error("Expected server env parsing to fail.");
    }

    expect(result.error.issues).toEqual([
      {
        envVar: "REDIS_URL",
        category: "malformed",
        message: "REDIS_URL must be a Redis URL.",
      },
      {
        envVar: "STRIPE_SECRET_KEY",
        category: "malformed",
        message: "STRIPE_SECRET_KEY must use a Stripe secret key prefix.",
      },
      {
        envVar: "STRIPE_WEBHOOK_SECRET",
        category: "malformed",
        message: "STRIPE_WEBHOOK_SECRET must use a Stripe webhook secret prefix.",
      },
      {
        envVar: "LOG_LEVEL",
        category: "unsupported",
        message: "LOG_LEVEL must be a supported logger level.",
      },
    ]);
  });

  it("rejects known placeholder values from the example env file", () => {
    const result = parseServerEnv({
      ...validEnv,
      STRIPE_SECRET_KEY: "sk_test_replace_with_local_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_replace_with_local_or_deployment_secret",
    });

    expect(result.isErr()).toBe(true);

    if (result.isOk()) {
      throw new Error("Expected server env parsing to fail.");
    }

    expect(result.error.issues).toEqual([
      {
        envVar: "STRIPE_SECRET_KEY",
        category: "placeholder",
        message: "STRIPE_SECRET_KEY must not use the example placeholder value.",
      },
      {
        envVar: "STRIPE_WEBHOOK_SECRET",
        category: "placeholder",
        message:
          "STRIPE_WEBHOOK_SECRET must not use the example placeholder value.",
      },
    ]);
  });

  it("defaults LOG_LEVEL when it is missing", () => {
    const envWithoutLogLevel: NodeJS.ProcessEnv = { ...validEnv };
    delete envWithoutLogLevel.LOG_LEVEL;

    const result = parseServerEnv(envWithoutLogLevel);

    expect(result.isOk()).toBe(true);

    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.LOG_LEVEL).toBe("info");
  });

  it("does not expose secret values in validation errors", () => {
    const result = parseServerEnv({
      ...validEnv,
      STRIPE_SECRET_KEY: "my-unexpected-secret-value",
      STRIPE_WEBHOOK_SECRET: "another-unexpected-secret-value",
    });

    expect(result.isErr()).toBe(true);

    if (result.isOk()) {
      throw new Error("Expected server env parsing to fail.");
    }

    expect(result.error.message).toBe(
      "Invalid server environment: STRIPE_SECRET_KEY (malformed), STRIPE_WEBHOOK_SECRET (malformed)",
    );
    expect(JSON.stringify(result.error.issues)).not.toContain(
      "my-unexpected-secret-value",
    );
    expect(JSON.stringify(result.error.issues)).not.toContain(
      "another-unexpected-secret-value",
    );
  });
});

describe("getServerEnv", () => {
  it("throws the sanitized startup-safe validation error", () => {
    expect(() =>
      getServerEnv({
        ...validEnv,
        REDIS_URL: "not a url",
      }),
    ).toThrow(ServerEnvValidationError);
    expect(() =>
      getServerEnv({
        ...validEnv,
        REDIS_URL: "not a url",
      }),
    ).toThrow("Invalid server environment: REDIS_URL (malformed)");
  });
});
