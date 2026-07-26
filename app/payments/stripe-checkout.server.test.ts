import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStripeCheckoutSession,
  getStripeCheckoutConfig,
  validateStripeCheckoutRequest,
  type CreateStripeCheckoutSession,
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
      checkoutUrl: "https://checkout.stripe.test/session/like",
    });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith({
      mode: "payment",
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
        "https://country-ranking.test/app/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://country-ranking.test/app/",
    });
  });

  it("creates a dislike checkout session with the approved price", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
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
          "https://country-ranking.test/checkout/success?session_id={CHECKOUT_SESSION_ID}",
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
