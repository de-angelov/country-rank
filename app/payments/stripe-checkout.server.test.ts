import { describe, expect, it } from "vitest";

import {
  getStripeCheckoutConfig,
  validateStripeCheckoutRequest,
} from "./stripe-checkout.server";

const envWithStripeSecret = {
  STRIPE_SECRET_KEY: "sk_test_checkout_secret",
};

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
