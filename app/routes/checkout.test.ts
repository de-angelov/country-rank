import { describe, expect, it, vi } from "vitest";

import type { ApplicationLogger } from "~/lib/logger.server";
import { createCheckoutHandler } from "./checkout.server";
import type { CreateStripeCheckoutSession } from "~/payments/stripe-checkout.server";

const envWithStripeSecret = {
  STRIPE_SECRET_KEY: "sk_test_checkout_secret",
};

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createMockLogger = (): ApplicationLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

describe("paid vote checkout route", () => {
  it("redirects browser-submitted paid vote requests to Stripe Checkout", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        url: "https://checkout.stripe.test/session/form",
      }),
    );
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
    });
    const formData = new FormData();
    formData.set("countryCode", "jp");
    formData.set("voteType", "like");

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://checkout.stripe.test/session/form",
    );
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          countryCode: "JP",
          voteType: "like",
        },
      }),
    );
  });

  it("returns a Checkout URL for valid JSON paid vote requests", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        url: "https://checkout.stripe.test/session/json",
      }),
    );
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
    });

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "de",
          voteType: "dislike",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        checkoutUrl: "https://checkout.stripe.test/session/json",
      },
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          countryCode: "DE",
          voteType: "dislike",
        },
      }),
    );
  });

  it("rejects invalid requests before calling Stripe", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
    });

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "Atlantis",
          voteType: "love",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_stripe_checkout_request",
        message:
          "We couldn't start checkout because the vote request is invalid.",
        fieldErrors: {
          countryCode: "Country code must match a supported country.",
          voteType: "Vote type must be like or dislike.",
        },
      },
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns a safe server error when Stripe configuration is missing", async () => {
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>();
    const handleCheckout = createCheckoutHandler({
      env: {},
      createSession,
      logger: paymentLogger,
    });
    const formData = new FormData();
    formData.set("countryCode", "CA");
    formData.set("voteType", "like");

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(500);
    const body = await readJson(response);

    expect(body).toEqual({
      ok: false,
      error: {
        code: "missing_stripe_checkout_config",
        message: "We couldn't start checkout. Please try again in a moment.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("STRIPE_SECRET_KEY");
    expect(createSession).not.toHaveBeenCalled();
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        route: "checkout",
        action: "read_stripe_checkout_config",
        errorCode: "missing_stripe_checkout_config",
        envVar: "STRIPE_SECRET_KEY",
      },
      "Stripe checkout configuration was missing.",
    );
    expect(JSON.stringify(vi.mocked(paymentLogger.error).mock.calls)).not.toContain(
      envWithStripeSecret.STRIPE_SECRET_KEY,
    );
  });

  it("returns a safe server error when Stripe session creation fails", async () => {
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.reject(new Error("Stripe API unavailable")),
    );
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      logger: paymentLogger,
    });

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_checkout_failure",
        },
        body: JSON.stringify({
          countryCode: "BR",
          voteType: "like",
        }),
      }),
    );

    expect(response.status).toBe(502);
    const body = await readJson(response);

    expect(body).toEqual({
      ok: false,
      error: {
        code: "stripe_checkout_session_creation_failed",
        message: "We couldn't start checkout. Please try again in a moment.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("Stripe API unavailable");
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        route: "checkout",
        action: "create_stripe_checkout_session",
        errorCode: "stripe_checkout_session_creation_failed",
        countryCode: "BR",
        voteType: "like",
        requestId: "req_checkout_failure",
      },
      "Stripe checkout session creation failed.",
    );
    expect(JSON.stringify(vi.mocked(paymentLogger.error).mock.calls)).not.toContain(
      envWithStripeSecret.STRIPE_SECRET_KEY,
    );
  });

  it("does not increment Redis vote totals while creating checkout", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        url: "https://checkout.stripe.test/session/no-redis",
      }),
    );
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
    });

    await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "JP",
          voteType: "like",
        }),
      }),
    );

    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty("totals");
  });
});
