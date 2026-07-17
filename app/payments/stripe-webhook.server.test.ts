import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import {
  getStripeWebhookConfig,
  verifyStripeWebhookSignature,
} from "./stripe-webhook.server";

const webhookSecret = "whsec_test_secret";
const envWithStripeWebhookSecret = {
  STRIPE_WEBHOOK_SECRET: webhookSecret,
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

describe("getStripeWebhookConfig", () => {
  it("returns a clear error when webhook configuration is missing", () => {
    const result = getStripeWebhookConfig({});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_webhook_config",
      message: "STRIPE_WEBHOOK_SECRET must be set to verify Stripe webhooks.",
      envVar: "STRIPE_WEBHOOK_SECRET",
    });
  });

  it("reads the webhook secret from the environment", () => {
    const result = getStripeWebhookConfig(envWithStripeWebhookSecret);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      webhookSecret,
    });
  });
});

describe("verifyStripeWebhookSignature", () => {
  it("returns a verified placeholder event for valid signatures", () => {
    const result = verifyStripeWebhookSignature(
      payload,
      signedHeader,
      envWithStripeWebhookSecret,
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

    const result = verifyStripeWebhookSignature(
      payloadWithoutSessionId,
      header,
      envWithStripeWebhookSecret,
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

    const result = verifyStripeWebhookSignature(
      payloadWithMalformedSessionId,
      header,
      envWithStripeWebhookSecret,
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
    const result = verifyStripeWebhookSignature(
      payload,
      signedHeader,
      {
        STRIPE_WEBHOOK_SECRET: "whsec_wrong_secret",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "invalid_stripe_signature",
      message: "Stripe webhook signature verification failed.",
    });
  });
});
