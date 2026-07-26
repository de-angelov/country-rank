import { afterEach, describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";

import type { ApplicationLogger } from "~/lib/logger.server";
import { createCheckoutHandler } from "./checkout.server";
import type { CreateStripeCheckoutSession } from "~/payments/stripe-checkout.server";
import type {
  PaidVoteFulfillmentRecord,
  RedisPaidVoteFulfillmentError,
} from "~/votes/fulfillment.server";

const envWithStripeSecret = {
  STRIPE_SECRET_KEY: "sk_test_checkout_secret",
};

const validSharedServerEnv = {
  REDIS_URL: "redis://localhost:6379",
  STRIPE_SECRET_KEY: "sk_test_validSecret123",
  STRIPE_WEBHOOK_SECRET: "whsec_validSecret123",
};

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createMockLogger = (): ApplicationLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createSuccessfulFulfillmentWriter = () =>
  vi.fn((record: PaidVoteFulfillmentRecord) => okAsync(record));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paid vote checkout route", () => {
  it("redirects browser-submitted paid vote requests to Stripe Checkout", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_form",
        url: "https://checkout.stripe.test/session/form",
      }),
    );
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      writeFulfillmentRecord,
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
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "pending",
      checkoutSessionId: "cs_test_form",
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a Checkout URL for valid JSON paid vote requests", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_json",
        url: "https://checkout.stripe.test/session/json",
      }),
    );
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      writeFulfillmentRecord,
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
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "pending",
      checkoutSessionId: "cs_test_json",
      countryCode: "DE",
      voteType: "dislike",
    });
  });

  it("rejects invalid requests before calling Stripe", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>();
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      writeFulfillmentRecord,
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
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
  });

  it("returns a safe server error when Stripe configuration is missing", async () => {
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>();
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: {},
      createSession,
      logger: paymentLogger,
      writeFulfillmentRecord,
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
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
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

  it("uses shared server config validation for the default checkout path", async () => {
    vi.stubEnv("REDIS_URL", "https://localhost:6379");
    vi.stubEnv(
      "STRIPE_SECRET_KEY",
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    vi.stubEnv(
      "STRIPE_WEBHOOK_SECRET",
      validSharedServerEnv.STRIPE_WEBHOOK_SECRET,
    );
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_default_env",
        url: "https://checkout.stripe.test/session/default-env",
      }),
    );
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      createSession,
      logger: paymentLogger,
      writeFulfillmentRecord,
    });

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "CA",
          voteType: "like",
        }),
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
    expect(createSession).not.toHaveBeenCalled();
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        route: "checkout",
        action: "read_stripe_checkout_config",
        errorCode: "missing_stripe_checkout_config",
        envVar: "STRIPE_SECRET_KEY",
      },
      "Stripe checkout configuration was missing.",
    );
    expect(JSON.stringify(body)).not.toContain(
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
    expect(JSON.stringify(vi.mocked(paymentLogger.error).mock.calls)).not.toContain(
      validSharedServerEnv.STRIPE_SECRET_KEY,
    );
  });

  it("returns a safe server error when Stripe session creation fails", async () => {
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.reject(new Error("Stripe API unavailable")),
    );
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      logger: paymentLogger,
      writeFulfillmentRecord,
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
    expect(writeFulfillmentRecord).not.toHaveBeenCalled();
  });

  it("does not increment Redis vote totals while creating checkout", async () => {
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_no_redis",
        url: "https://checkout.stripe.test/session/no-redis",
      }),
    );
    const writeFulfillmentRecord = createSuccessfulFulfillmentWriter();
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      writeFulfillmentRecord,
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

  it("returns a safe server error when pending paid vote tracking fails", async () => {
    const paymentLogger = createMockLogger();
    const createSession = vi.fn<CreateStripeCheckoutSession>(() =>
      Promise.resolve({
        id: "cs_test_tracking_failure",
        url: "https://checkout.stripe.test/session/tracking-failure",
      }),
    );
    const trackingError: RedisPaidVoteFulfillmentError = {
      code: "redis_command_failed",
      message: "Failed to write paid vote fulfillment record to Redis.",
      cause: new Error("Redis unavailable"),
    };
    const writeFulfillmentRecord = vi.fn(() => errAsync(trackingError));
    const handleCheckout = createCheckoutHandler({
      env: envWithStripeSecret,
      createSession,
      logger: paymentLogger,
      writeFulfillmentRecord,
    });

    const response = await handleCheckout(
      new Request("https://country-ranking.test/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_tracking_failure",
        },
        body: JSON.stringify({
          countryCode: "JP",
          voteType: "like",
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "paid_vote_tracking_failed",
        message: "We couldn't start checkout. Please try again in a moment.",
        causeCode: "redis_command_failed",
      },
    });
    expect(writeFulfillmentRecord).toHaveBeenCalledWith({
      status: "pending",
      checkoutSessionId: "cs_test_tracking_failure",
      countryCode: "JP",
      voteType: "like",
    });
    expect(paymentLogger.error).toHaveBeenCalledWith(
      {
        route: "checkout",
        action: "write_paid_vote_pending_fulfillment",
        errorCode: "redis_command_failed",
        checkoutSessionId: "cs_test_tracking_failure",
        countryCode: "JP",
        voteType: "like",
        requestId: "req_tracking_failure",
      },
      "Paid vote pending fulfillment write failed.",
    );
  });
});
