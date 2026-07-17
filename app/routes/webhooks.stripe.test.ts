import Stripe from "stripe";
import { errAsync, okAsync } from "neverthrow";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStripeWebhookHandler } from "./webhooks.stripe.server";
import { action } from "./webhooks.stripe";

const webhookSecret = "whsec_route_test_secret";
const verifiedCheckoutPayload = JSON.stringify({
  id: "evt_route_signature_shell",
  object: "event",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_route_signature_shell",
      object: "checkout.session",
      metadata: {
        countryCode: "JP",
        voteType: "like",
      },
    },
  },
});

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createRequest = (payload: string, signature: string | null) =>
  new Request("https://example.test/webhooks/stripe", {
    method: "POST",
    headers: signature
      ? {
          "stripe-signature": signature,
        }
      : undefined,
    body: payload,
  });

const signPayload = (payload: string) =>
  Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });

describe("Stripe webhook route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a typed configuration error when the webhook secret is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const response = await action({
      request: createRequest(verifiedCheckoutPayload, "t=1,v1=invalid"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "missing_stripe_webhook_config",
        message: "STRIPE_WEBHOOK_SECRET must be set to verify Stripe webhooks.",
        envVar: "STRIPE_WEBHOOK_SECRET",
      },
    });
  });

  it("rejects invalid signatures through a typed error response", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);

    const response = await action({
      request: createRequest(verifiedCheckoutPayload, "t=1,v1=invalid"),
      params: {},
      context: {},
    });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_stripe_signature",
        message: "Stripe webhook signature verification failed.",
      },
    });
  });

  it("applies a paid vote after a verified successful checkout event", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const applyPaidVote = vi.fn(() =>
      okAsync({
        status: "applied" as const,
        checkoutSessionId: "cs_test_route_signature_shell",
        countryCode: "JP",
        voteType: "like" as const,
        totals: {
          countryCode: "JP",
          likes: 3,
          dislikes: 1,
        },
      }),
    );
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(verifiedCheckoutPayload, signPayload(verifiedCheckoutPayload)),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "applied",
        event: {
          id: "evt_route_signature_shell",
          type: "checkout.session.completed",
          checkoutSessionId: "cs_test_route_signature_shell",
        },
        vote: {
          countryCode: "JP",
          voteType: "like",
          totals: {
            countryCode: "JP",
            likes: 3,
            dislikes: 1,
          },
        },
      },
    });
    expect(applyPaidVote).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_route_signature_shell",
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a successful duplicate response without applying another vote", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const applyPaidVote = vi.fn(() =>
      okAsync({
        status: "duplicate" as const,
        checkoutSessionId: "cs_test_route_signature_shell",
        countryCode: "JP",
        voteType: "like" as const,
        totals: {
          countryCode: "JP",
          likes: 3,
          dislikes: 1,
        },
      }),
    );
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(verifiedCheckoutPayload, signPayload(verifiedCheckoutPayload)),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "duplicate",
        event: {
          id: "evt_route_signature_shell",
          type: "checkout.session.completed",
          checkoutSessionId: "cs_test_route_signature_shell",
        },
        vote: {
          countryCode: "JP",
          voteType: "like",
          totals: {
            countryCode: "JP",
            likes: 3,
            dislikes: 1,
          },
        },
      },
    });
    expect(applyPaidVote).toHaveBeenCalledTimes(1);
    expect(applyPaidVote).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_route_signature_shell",
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a typed fulfillment read error without applying a vote", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const applyPaidVote = vi.fn(() =>
      errAsync({
        code: "paid_vote_fulfillment_read_failed" as const,
        message: "Failed to read paid vote fulfillment before applying vote.",
        checkoutSessionId: "cs_test_route_signature_shell",
        cause: {
          code: "redis_command_failed" as const,
          message:
            "Failed to read paid vote fulfillment record from Redis.",
          cause: new Error("redis get failed"),
        },
      }),
    );
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(verifiedCheckoutPayload, signPayload(verifiedCheckoutPayload)),
    );

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "paid_vote_fulfillment_read_failed",
        message: "Failed to read paid vote fulfillment before applying vote.",
        checkoutSessionId: "cs_test_route_signature_shell",
        cause: {
          code: "redis_command_failed",
          message:
            "Failed to read paid vote fulfillment record from Redis.",
        },
      },
    });
    expect(applyPaidVote).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_route_signature_shell",
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a typed fulfillment write error after the vote is applied but not recorded", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const applyPaidVote = vi.fn(() =>
      errAsync({
        code: "paid_vote_fulfillment_write_failed" as const,
        message:
          "Failed to write paid vote fulfillment after applying vote.",
        checkoutSessionId: "cs_test_route_signature_shell",
        cause: {
          code: "redis_command_failed" as const,
          message:
            "Failed to write paid vote fulfillment record to Redis.",
          cause: new Error("redis set failed"),
        },
      }),
    );
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(verifiedCheckoutPayload, signPayload(verifiedCheckoutPayload)),
    );

    expect(response.status).toBe(500);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "paid_vote_fulfillment_write_failed",
        message:
          "Failed to write paid vote fulfillment after applying vote.",
        checkoutSessionId: "cs_test_route_signature_shell",
        cause: {
          code: "redis_command_failed",
          message:
            "Failed to write paid vote fulfillment record to Redis.",
        },
      },
    });
    expect(applyPaidVote).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_route_signature_shell",
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a typed metadata error without applying a vote", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const payload = JSON.stringify({
      id: "evt_route_missing_metadata",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_route_missing_metadata",
          object: "checkout.session",
          metadata: {
            countryCode: "JP",
          },
        },
      },
    });
    const applyPaidVote = vi.fn();
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(payload, signPayload(payload)),
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_stripe_paid_vote_metadata",
        message: "Stripe paid vote metadata is invalid.",
        fieldErrors: {
          voteType: "Stripe paid vote metadata must include voteType.",
        },
      },
    });
    expect(applyPaidVote).not.toHaveBeenCalled();
  });

  it("ignores unsupported verified events without applying a vote", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const payload = JSON.stringify({
      id: "evt_route_payment_intent_succeeded",
      object: "event",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_route_ignored",
          object: "payment_intent",
          metadata: {
            countryCode: "JP",
            voteType: "like",
          },
        },
      },
    });
    const applyPaidVote = vi.fn();
    const handleStripeWebhook = createStripeWebhookHandler({ applyPaidVote });

    const response = await handleStripeWebhook(
      createRequest(payload, signPayload(payload)),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "ignored",
        event: {
          id: "evt_route_payment_intent_succeeded",
          type: "payment_intent.succeeded",
        },
      },
    });
    expect(applyPaidVote).not.toHaveBeenCalled();
  });
});
