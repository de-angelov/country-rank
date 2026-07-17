import { describe, expect, it } from "vitest";

import { createServerErrorResponse } from "./server-error-response.server";

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

describe("createServerErrorResponse", () => {
  it("returns a stable JSON error shape with the requested status", async () => {
    const response = createServerErrorResponse({
      status: 503,
      code: "redis_command_failed",
      publicMessage: "Service is temporarily unavailable.",
    });

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "redis_command_failed",
        message: "Service is temporarily unavailable.",
      },
    });
  });

  it("includes the request ID when one is provided", async () => {
    const response = createServerErrorResponse({
      status: 502,
      code: "stripe_checkout_session_creation_failed",
      publicMessage: "We couldn't start checkout.",
      requestId: "req_checkout_failure",
    });

    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "stripe_checkout_session_creation_failed",
        message: "We couldn't start checkout.",
        requestId: "req_checkout_failure",
      },
    });
  });

  it("does not expose internal causes or operational metadata", async () => {
    const response = createServerErrorResponse({
      status: 500,
      code: "missing_stripe_checkout_config",
      publicMessage: "We couldn't start checkout. Please try again in a moment.",
    });

    const body = await readJson(response);

    expect(JSON.stringify(body)).not.toContain("STRIPE_SECRET_KEY");
    expect(JSON.stringify(body)).not.toContain("cause");
    expect(JSON.stringify(body)).not.toContain("Error");
  });
});
