import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultStripeWebhookSignatureVerifier,
  createStripeWebhookSignatureVerifierFromEnv,
  getDefaultStripeWebhookConfig,
  getStripeWebhookConfigFromEnv,
  verifyStripeWebhookSignature,
  verifyStripeWebhookSignatureWithConfig,
} from "./stripe-webhook.server";

const webhookSecret = "whsec_test_secret";
const envWithStripeWebhookSecret = {
  STRIPE_WEBHOOK_SECRET: webhookSecret,
};
const validSharedServerEnv = {
  REDIS_URL: "redis://localhost:6379",
  STRIPE_SECRET_KEY: "sk_test_validSecret123",
  STRIPE_WEBHOOK_SECRET: "whsec_validSecret123",
};
const payload = JSON.stringify({
  id: "evt_test_signature_shell",
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_signature_shell",
      object: "checkout.session",
      metadata: {
        countryCode: "JP",
        voteType: "like",
      },
    },
  },
});

const signedHeader = Stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const getInjectedWebhookConfig = () => {
  const configResult = getStripeWebhookConfigFromEnv(envWithStripeWebhookSecret);

  if (configResult.isErr()) {
    throw configResult.error;
  }

  return configResult.value;
};

describe("getStripeWebhookConfigFromEnv", () => {
  it("returns a clear error when webhook configuration is missing", () => {
    const result = getStripeWebhookConfigFromEnv({});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_webhook_config",
      message: "STRIPE_WEBHOOK_SECRET must be set to verify Stripe webhooks.",
      envVar: "STRIPE_WEBHOOK_SECRET",
    });
  });

  it("reads the webhook secret from the environment", () => {
    const result = getStripeWebhookConfigFromEnv(envWithStripeWebhookSecret);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      webhookSecret,
    });
  });

  it("keeps injected env objects scoped to Stripe webhook config", () => {
    const result = getStripeWebhookConfigFromEnv({
      STRIPE_WEBHOOK_SECRET: " whsec_injectedWebhookSecret123 ",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      webhookSecret: "whsec_injectedWebhookSecret123",
    });
  });

});

describe("getDefaultStripeWebhookConfig", () => {
  it("uses the shared server config validation for the default path", () => {
    vi.stubEnv("REDIS_URL", "https://localhost:6379");
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv(
      "STRIPE_WEBHOOK_SECRET",
      validSharedServerEnv.STRIPE_WEBHOOK_SECRET,
    );

    const result = getDefaultStripeWebhookConfig();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_webhook_config",
      message: "STRIPE_WEBHOOK_SECRET must be set to verify Stripe webhooks.",
      envVar: "STRIPE_WEBHOOK_SECRET",
    });
  });

  it("returns the shared server webhook secret for the default path", () => {
    vi.stubEnv("REDIS_URL", validSharedServerEnv.REDIS_URL);
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv(
      "STRIPE_WEBHOOK_SECRET",
      validSharedServerEnv.STRIPE_WEBHOOK_SECRET,
    );

    const result = getDefaultStripeWebhookConfig();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      webhookSecret: validSharedServerEnv.STRIPE_WEBHOOK_SECRET,
    });
  });
});

describe("verifyStripeWebhookSignature", () => {
  it("returns a verified placeholder event for valid signatures", () => {
    const result = verifyStripeWebhookSignatureWithConfig(
      payload,
      signedHeader,
      getInjectedWebhookConfig(),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      id: "evt_test_signature_shell",
      type: "checkout.session.completed",
      checkoutSessionId: "cs_test_signature_shell",
      metadata: {
        countryCode: "JP",
        voteType: "like",
      },
    });
  });

  it("rejects checkout completion events with a missing session ID", () => {
    const payloadWithoutSessionId = JSON.stringify({
      id: "evt_test_missing_session",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          metadata: {
            countryCode: "JP",
            voteType: "like",
          },
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: payloadWithoutSessionId,
      secret: webhookSecret,
    });

    const result = verifyStripeWebhookSignatureWithConfig(
      payloadWithoutSessionId,
      header,
      getInjectedWebhookConfig(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_checkout_session_id",
      message: "Stripe checkout session ID is invalid.",
      fieldErrors: {
        checkoutSessionId:
          "checkout.session.completed events must include a valid Checkout Session ID.",
      },
    });
  });

  it("rejects checkout completion events with a malformed session ID", () => {
    const payloadWithMalformedSessionId = JSON.stringify({
      id: "evt_test_malformed_session",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "pi_test_malformed_session",
          object: "checkout.session",
          metadata: {
            countryCode: "JP",
            voteType: "like",
          },
        },
      },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: payloadWithMalformedSessionId,
      secret: webhookSecret,
    });

    const result = verifyStripeWebhookSignatureWithConfig(
      payloadWithMalformedSessionId,
      header,
      getInjectedWebhookConfig(),
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invalid_stripe_checkout_session_id",
      fieldErrors: {
        checkoutSessionId:
          "checkout.session.completed events must include a valid Checkout Session ID.",
      },
    });
  });

  it("rejects invalid signatures through a typed error path", () => {
    const result = verifyStripeWebhookSignatureWithConfig(
      payload,
      signedHeader,
      { webhookSecret: "whsec_wrong_secret" },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invalid_stripe_signature",
      message: "Stripe webhook signature verification failed.",
    });
  });

  it("uses the default shared server config path", () => {
    vi.stubEnv("REDIS_URL", validSharedServerEnv.REDIS_URL);
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);

    const result = verifyStripeWebhookSignature(payload, signedHeader);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "evt_test_signature_shell",
      type: "checkout.session.completed",
    });
  });
});

describe("createDefaultStripeWebhookSignatureVerifier", () => {
  it("creates a verifier for the default shared server config path", () => {
    vi.stubEnv("REDIS_URL", validSharedServerEnv.REDIS_URL);
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);

    const verifyWebhookSignature = createDefaultStripeWebhookSignatureVerifier();

    const result = verifyWebhookSignature(payload, signedHeader);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "evt_test_signature_shell",
      type: "checkout.session.completed",
    });
  });

  it("creates an injected-env verifier without mutating process.env", () => {
    const verifyWebhookSignature =
      createStripeWebhookSignatureVerifierFromEnv(envWithStripeWebhookSecret);

    const result = verifyWebhookSignature(payload, signedHeader);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      id: "evt_test_signature_shell",
      type: "checkout.session.completed",
    });
  });
});
