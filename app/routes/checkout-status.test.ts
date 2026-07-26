import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import { createCheckoutStatusHandler } from "./checkout-status.server";

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

const createRequest = (sessionId?: string) =>
  new Request(
    `https://example.test/checkout-status${
      sessionId === undefined ? "" : `?session_id=${sessionId}`
    }`,
  );

describe("checkout status route", () => {
  it("returns applied paid vote details from the fulfillment record", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "applied" as const,
        checkoutSessionId: "cs_test_checkout_status_applied",
        countryCode: "JP",
        voteType: "like" as const,
        totals: {
          countryCode: "JP",
          likes: 12,
          dislikes: 3,
        },
      }),
    );
    const handleCheckoutStatus = createCheckoutStatusHandler({
      readFulfillmentRecord,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_applied"),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "applied",
        countryCode: "JP",
        voteType: "like",
        totals: {
          countryCode: "JP",
          likes: 12,
          dislikes: 3,
        },
      },
    });
    expect(readFulfillmentRecord).toHaveBeenCalledWith(
      "cs_test_checkout_status_applied",
    );
  });

  it("returns pending without exposing vote intent", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "pending" as const,
        checkoutSessionId: "cs_test_checkout_status_pending",
        countryCode: "DE",
        voteType: "dislike" as const,
      }),
    );
    const retrieveCheckoutSession = vi.fn(async () => ({
      id: "cs_test_checkout_status_pending",
      status: "open" as const,
      payment_status: "unpaid" as const,
      metadata: {
        countryCode: "DE",
        voteType: "dislike",
      },
    }));
    const applyPaidVote = vi.fn();
    const handleCheckoutStatus = createCheckoutStatusHandler({
      applyPaidVote,
      env: {
        STRIPE_SECRET_KEY: "sk_test_checkoutStatusSecret",
      },
      readFulfillmentRecord,
      retrieveCheckoutSession,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_pending"),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "pending",
      },
    });
    expect(retrieveCheckoutSession).toHaveBeenCalledWith(
      "cs_test_checkout_status_pending",
    );
    expect(applyPaidVote).not.toHaveBeenCalled();
  });

  it("applies pending paid votes when Stripe has completed the session", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "pending" as const,
        checkoutSessionId: "cs_test_checkout_status_paid",
        countryCode: "AX",
        voteType: "like" as const,
      }),
    );
    const retrieveCheckoutSession = vi.fn(async () => ({
      id: "cs_test_checkout_status_paid",
      status: "complete" as const,
      payment_status: "paid" as const,
      metadata: {
        countryCode: "AX",
        voteType: "like",
      },
    }));
    const applyPaidVote = vi.fn(() =>
      okAsync({
        status: "applied" as const,
        checkoutSessionId: "cs_test_checkout_status_paid",
        countryCode: "AX",
        voteType: "like" as const,
        totals: {
          countryCode: "AX",
          likes: 8,
          dislikes: 2,
        },
      }),
    );
    const handleCheckoutStatus = createCheckoutStatusHandler({
      applyPaidVote,
      env: {
        STRIPE_SECRET_KEY: "sk_test_checkoutStatusSecret",
      },
      readFulfillmentRecord,
      retrieveCheckoutSession,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_paid"),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "applied",
        countryCode: "AX",
        voteType: "like",
        totals: {
          countryCode: "AX",
          likes: 8,
          dislikes: 2,
        },
      },
    });
    expect(applyPaidVote).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_checkout_status_paid",
      countryCode: "AX",
      voteType: "like",
    });
  });

  it("returns not_found for missing fulfillment records", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "not_found" as const,
        checkoutSessionId: "cs_test_checkout_status_missing",
      }),
    );
    const handleCheckoutStatus = createCheckoutStatusHandler({
      readFulfillmentRecord,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_missing"),
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "not_found",
      },
    });
  });

  it("rejects missing session IDs before reading Redis", async () => {
    const readFulfillmentRecord = vi.fn();
    const handleCheckoutStatus = createCheckoutStatusHandler({
      readFulfillmentRecord,
    });

    const response = await handleCheckoutStatus(createRequest());

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_checkout_status_request",
        message: "Checkout status request is invalid.",
        fieldErrors: {
          session_id: "session_id is required.",
        },
      },
    });
    expect(readFulfillmentRecord).not.toHaveBeenCalled();
  });

  it("rejects malformed session IDs before reading Redis", async () => {
    const readFulfillmentRecord = vi.fn();
    const handleCheckoutStatus = createCheckoutStatusHandler({
      readFulfillmentRecord,
    });

    const response = await handleCheckoutStatus(createRequest("pi_test_bad"));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_checkout_status_request",
        message: "Checkout status request is invalid.",
        fieldErrors: {
          session_id:
            "session_id must be a valid Stripe Checkout Session ID.",
        },
      },
    });
    expect(readFulfillmentRecord).not.toHaveBeenCalled();
  });

  it("returns a clear server error when Redis reads fail", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      errAsync({
        code: "redis_command_failed" as const,
        message: "Failed to read paid vote fulfillment record from Redis.",
        cause: new Error("redis unavailable"),
      }),
    );
    const handleCheckoutStatus = createCheckoutStatusHandler({
      readFulfillmentRecord,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_redis_failure"),
    );

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "redis_command_failed",
        message: "Failed to read paid vote fulfillment record from Redis.",
      },
    });
  });

  it("returns a clear server error when pending Stripe session retrieval fails", async () => {
    const readFulfillmentRecord = vi.fn(() =>
      okAsync({
        status: "pending" as const,
        checkoutSessionId: "cs_test_checkout_status_stripe_failure",
        countryCode: "DE",
        voteType: "like" as const,
      }),
    );
    const retrieveCheckoutSession = vi.fn(async () => {
      throw new Error("stripe unavailable");
    });
    const handleCheckoutStatus = createCheckoutStatusHandler({
      env: {
        STRIPE_SECRET_KEY: "sk_test_checkoutStatusSecret",
      },
      readFulfillmentRecord,
      retrieveCheckoutSession,
    });

    const response = await handleCheckoutStatus(
      createRequest("cs_test_checkout_status_stripe_failure"),
    );

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "stripe_checkout_session_retrieval_failed",
        message: "Failed to retrieve Stripe checkout session.",
        checkoutSessionId: "cs_test_checkout_status_stripe_failure",
      },
    });
  });
});
