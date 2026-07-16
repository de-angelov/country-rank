import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";

import { action } from "./webhooks.stripe";

const webhookSecret = "whsec_route_test_secret";
const payload = JSON.stringify({
  id: "evt_route_signature_shell",
  object: "event",
  type: "checkout.session.completed",
});

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createRequest = (signature: string | null) =>
  new Request("https://example.test/webhooks/stripe", {
    method: "POST",
    headers: signature
      ? {
          "stripe-signature": signature,
        }
      : undefined,
    body: payload,
  });

describe("Stripe webhook route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a typed configuration error when the webhook secret is missing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const response = await action({
      request: createRequest("t=1,v1=invalid"),
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
      request: createRequest("t=1,v1=invalid"),
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

  it("returns a placeholder success response for valid signatures", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", webhookSecret);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const response = await action({
      request: createRequest(signature),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "verified",
        event: {
          id: "evt_route_signature_shell",
          type: "checkout.session.completed",
        },
      },
    });
  });
});
