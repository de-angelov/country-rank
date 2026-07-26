import { describe, expect, it } from "vitest";

import {
  runStartupEnvVerifier,
  verifyServerEnv,
} from "./verify-server-env.mjs";

const validEnv = {
  REDIS_URL: "redis://localhost:6379",
  STRIPE_SECRET_KEY: "sk_test_startupSecret123",
  STRIPE_WEBHOOK_SECRET: "whsec_startupSecret123",
  LOG_LEVEL: "info",
};

describe("verifyServerEnv", () => {
  it("passes with valid test-mode Redis and Stripe env", () => {
    expect(verifyServerEnv(validEnv)).toEqual({ ok: true });
  });

  it("returns sanitized missing, malformed, and placeholder issues", () => {
    const rawSecret = "sk_test_replace_with_local_test_secret";
    const rawWebhookSecret = "raw-webhook-secret";
    const result = verifyServerEnv({
      REDIS_URL: "postgres://localhost:5432/app",
      STRIPE_SECRET_KEY: rawSecret,
      STRIPE_WEBHOOK_SECRET: rawWebhookSecret,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected startup env verification to fail.");
    }

    expect(result.message).toBe(
      "Invalid server environment: REDIS_URL (malformed), STRIPE_SECRET_KEY (placeholder), STRIPE_WEBHOOK_SECRET (malformed)",
    );
    expect(JSON.stringify(result)).not.toContain(rawSecret);
    expect(JSON.stringify(result)).not.toContain(rawWebhookSecret);
    expect(JSON.stringify(result)).not.toContain("postgres://localhost");
  });
});

describe("runStartupEnvVerifier", () => {
  it("writes operationally useful errors without raw env values", () => {
    let stderr = "";
    const exitCode = runStartupEnvVerifier({
      env: {
        REDIS_URL: "not a redis url",
        STRIPE_SECRET_KEY: "sk_test_replace_with_local_test_secret",
        STRIPE_WEBHOOK_SECRET: "whsec_replace_with_local_or_deployment_secret",
      },
      stderr: {
        write(chunk) {
          stderr += chunk;
        },
      },
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain("REDIS_URL");
    expect(stderr).toContain("STRIPE_SECRET_KEY");
    expect(stderr).toContain("STRIPE_WEBHOOK_SECRET");
    expect(stderr).toContain("malformed");
    expect(stderr).toContain("placeholder");
    expect(stderr).not.toContain("not a redis url");
    expect(stderr).not.toContain("sk_test_replace_with_local_test_secret");
    expect(stderr).not.toContain(
      "whsec_replace_with_local_or_deployment_secret",
    );
  });
});
