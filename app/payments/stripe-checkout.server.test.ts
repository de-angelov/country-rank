import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStripeCheckoutCancelUrl,
  buildStripeCheckoutSuccessUrl,
  createStripeCheckoutSession,
  getStripeCheckoutConfig,
  getStripeCheckoutSessionPaymentStatus,
  validateStripeCheckoutRequest,
  type CreateStripeCheckoutSession,
  type RetrieveStripeCheckoutSession,
} from "./stripe-checkout.server";

const envWithStripeSecret = {
  STRIPE_SECRET_KEY: "sk_test_checkout_secret",
};

const validSharedServerEnv = {
  REDIS_URL: "redis://localhost:6379",
  STRIPE_SECRET_KEY: "sk_test_validSecret123",
  STRIPE_WEBHOOK_SECRET: "whsec_validSecret123",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getStripeCheckoutConfig", () => {
  it("returns a typed error when Stripe secret configuration is missing", () => {
    const result = getStripeCheckoutConfig({});

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_checkout_config",
      message:
        "STRIPE_SECRET_KEY must be set to create Stripe checkout sessions.",
      envVar: "STRIPE_SECRET_KEY",
    });
  });

  it("reads the Stripe secret key from the environment", () => {
    const result = getStripeCheckoutConfig(envWithStripeSecret);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      secretKey: "sk_test_checkout_secret",
    });
  });

  it("keeps injected env objects scoped to Stripe checkout config", () => {
    const result = getStripeCheckoutConfig({
      STRIPE_SECRET_KEY: " sk_test_injectedCheckoutSecret123 ",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      secretKey: "sk_test_injectedCheckoutSecret123",
    });
  });

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

    const result = getStripeCheckoutConfig();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_checkout_config",
      message:
        "STRIPE_SECRET_KEY must be set to create Stripe checkout sessions.",
      envVar: "STRIPE_SECRET_KEY",
    });
  });

  it("returns the shared server Stripe secret for the default path", () => {
    vi.stubEnv("REDIS_URL", validSharedServerEnv.REDIS_URL);
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv(
      "STRIPE_WEBHOOK_SECRET",
      validSharedServerEnv.STRIPE_WEBHOOK_SECRET,
    );

    const result = getStripeCheckoutConfig();

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      secretKey: validSharedServerEnv.STRIPE_SECRET_KEY,
    });
  });
});

describe("validateStripeCheckoutRequest", () => {
  it("returns normalized checkout request data for valid paid vote input", () => {
    const result = validateStripeCheckoutRequest(
      {
        countryCode: "jp",
        voteType: "like",
      },
      envWithStripeSecret,
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a typed validation error for invalid country input", () => {
    const result = validateStripeCheckoutRequest(
      {
        countryCode: "Atlantis",
        voteType: "like",
      },
      envWithStripeSecret,
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_checkout_request",
      message: "Stripe checkout request payload is invalid.",
      fieldErrors: {
        countryCode: "Country code must match a supported country.",
      },
    });
  });

  it("returns a typed validation error for invalid vote type input", () => {
    const result = validateStripeCheckoutRequest(
      {
        countryCode: "DE",
        voteType: "upvote",
      },
      envWithStripeSecret,
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_checkout_request",
      message: "Stripe checkout request payload is invalid.",
      fieldErrors: {
        voteType: "Vote type must be like or dislike.",
      },
    });
  });

  it("returns a typed configuration error when Stripe secret config is missing", () => {
    const result = validateStripeCheckoutRequest(
      {
        countryCode: "CA",
        voteType: "dislike",
      },
      {},
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "missing_stripe_checkout_config",
      message:
        "STRIPE_SECRET_KEY must be set to create Stripe checkout sessions.",
      envVar: "STRIPE_SECRET_KEY",
    });
  });
});

describe("createStripeCheckoutSession", () => {
  const config = {
    secretKey: "sk_test_checkout_secret",
  };
  const appBaseUrl = "https://country-ranking.test/app/";

  it("creates a like checkout session with the approved price and metadata", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_like",
        url: "https://checkout.stripe.test/session/like",
      }),
    );

    const result = await createStripeCheckoutSession(
      {
        countryCode: "JP",
        voteType: "like",
      },
      {
        config,
        appBaseUrl,
        createSession,
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      checkoutSessionId: "cs_test_like",
      checkoutUrl: "https://checkout.stripe.test/session/like",
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith({
      mode: "payment",
      managed_payments: {
        enabled: false,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 100,
            product_data: {
              name: "Paid like vote for JP",
            },
          },
        },
      ],
      metadata: {
        countryCode: "JP",
        voteType: "like",
      },
      success_url:
        "https://country-ranking.test/app/?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://country-ranking.test/app/",
    });
  });

  it("creates a dislike checkout session with the approved price", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_dislike",
        url: "https://checkout.stripe.test/session/dislike",
      }),
    );

    const result = await createStripeCheckoutSession(
      {
        countryCode: "DE",
        voteType: "dislike",
      },
      {
        config,
        appBaseUrl: "https://country-ranking.test",
        createSession,
      },
    );

    expect(result.isOk()).toBe(true);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        managed_payments: {
          enabled: false,
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 200,
              product_data: {
                name: "Paid dislike vote for DE",
              },
            },
          },
        ],
        metadata: {
          countryCode: "DE",
          voteType: "dislike",
        },
        success_url:
          "https://country-ranking.test/?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "https://country-ranking.test/",
      }),
    );
  });

  it("returns a typed server error when Stripe rejects session creation", async () => {
    const stripeError = new Error("Stripe API unavailable");
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.reject(stripeError),
    );

    const result = await createStripeCheckoutSession(
      {
        countryCode: "CA",
        voteType: "like",
      },
      {
        config,
        appBaseUrl,
        createSession,
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "stripe_checkout_session_creation_failed",
      message: "Failed to create Stripe checkout session.",
      cause: stripeError,
    });
  });

  it("does not apply vote totals when creating checkout sessions", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_no_vote_write",
        url: "https://checkout.stripe.test/session/no-vote-write",
      }),
    );

    await createStripeCheckoutSession(
      {
        countryCode: "BR",
        voteType: "dislike",
      },
      {
        config,
        appBaseUrl,
        createSession,
      },
    );

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0]?.[0]).not.toHaveProperty("totals");
  });
});

describe("getStripeCheckoutSessionPaymentStatus", () => {
  const config = {
    secretKey: "sk_test_checkout_secret",
  };

  it("returns paid vote details for completed paid Checkout Sessions", async () => {
    const retrieveSession = vi.fn<RetrieveStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_paid",
        status: "complete",
        payment_status: "paid",
        metadata: {
          countryCode: "ax",
          voteType: "like",
        },
      }),
    );

    const result = await getStripeCheckoutSessionPaymentStatus("cs_test_paid", {
      config,
      retrieveSession,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "paid",
      checkoutSessionId: "cs_test_paid",
      countryCode: "AX",
      voteType: "like",
    });
    expect(retrieveSession).toHaveBeenCalledWith("cs_test_paid");
  });

  it("returns unpaid while the Checkout Session is still open", async () => {
    const retrieveSession = vi.fn<RetrieveStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_open",
        status: "open",
        payment_status: "unpaid",
        metadata: {
          countryCode: "DE",
          voteType: "dislike",
        },
      }),
    );

    const result = await getStripeCheckoutSessionPaymentStatus("cs_test_open", {
      config,
      retrieveSession,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "unpaid",
      checkoutSessionId: "cs_test_open",
    });
  });

  it("returns a typed error when completed paid metadata is invalid", async () => {
    const retrieveSession = vi.fn<RetrieveStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_bad_metadata",
        status: "complete",
        payment_status: "paid",
        metadata: {
          countryCode: "AX",
        },
      }),
    );

    const result = await getStripeCheckoutSessionPaymentStatus(
      "cs_test_bad_metadata",
      {
        config,
        retrieveSession,
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_checkout_session_metadata",
      message: "Stripe checkout session metadata is invalid.",
      checkoutSessionId: "cs_test_bad_metadata",
      cause: {
        code: "invalid_stripe_paid_vote_metadata",
        message: "Stripe paid vote metadata is invalid.",
        fieldErrors: {
          voteType: "Stripe paid vote metadata must include voteType.",
        },
      },
    });
  });

  it("returns a typed error when Stripe session retrieval fails", async () => {
    const stripeError = new Error("Stripe API unavailable");
    const retrieveSession = vi.fn<RetrieveStripeCheckoutSession>(() =>
      Promise.reject(stripeError),
    );

    const result = await getStripeCheckoutSessionPaymentStatus(
      "cs_test_retrieval_failure",
      {
        config,
        retrieveSession,
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "stripe_checkout_session_retrieval_failed",
      message: "Failed to retrieve Stripe checkout session.",
      checkoutSessionId: "cs_test_retrieval_failure",
      cause: stripeError,
    });
  });
});

describe("Stripe checkout redirect URLs", () => {
  it("returns successful checkouts to the home route confirmation query", () => {
    const successUrl = new URL(
      buildStripeCheckoutSuccessUrl("https://country-ranking.test/app/"),
    );

    expect(successUrl.origin).toBe("https://country-ranking.test");
    expect(successUrl.pathname).toBe("/app/");
    expect(successUrl.searchParams.get("session_id")).toBe(
      "{CHECKOUT_SESSION_ID}",
    );
    expect(successUrl.pathname).not.toBe("/checkout/success");
  });

  it("returns canceled checkouts to the home route", () => {
    expect(buildStripeCheckoutCancelUrl("https://country-ranking.test/app/")).toBe(
      "https://country-ranking.test/app/",
    );
  });
});
