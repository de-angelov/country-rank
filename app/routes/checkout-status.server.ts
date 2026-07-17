import { err, ok, type Result } from "neverthrow";

import {
  readPaidVoteFulfillmentRecord,
  type PaidVoteFulfillmentReadResult,
  type RedisPaidVoteFulfillmentError,
} from "~/votes/fulfillment.server";

const stripeCheckoutSessionIdPattern = /^cs_(test|live)_[A-Za-z0-9_]+$/;

type CheckoutStatusValidationError = Readonly<{
  code: "invalid_checkout_status_request";
  message: string;
  fieldErrors: Readonly<{
    session_id: string;
  }>;
}>;

type ReadPaidVoteFulfillmentRecord = typeof readPaidVoteFulfillmentRecord;

type CheckoutStatusHandlerOptions = Readonly<{
  readFulfillmentRecord?: ReadPaidVoteFulfillmentRecord;
}>;

const validateCheckoutSessionId = (
  value: string | null,
): Result<string, CheckoutStatusValidationError> => {
  const checkoutSessionId = value?.trim();

  if (!checkoutSessionId) {
    return err({
      code: "invalid_checkout_status_request",
      message: "Checkout status request is invalid.",
      fieldErrors: {
        session_id: "session_id is required.",
      },
    });
  }

  if (!stripeCheckoutSessionIdPattern.test(checkoutSessionId)) {
    return err({
      code: "invalid_checkout_status_request",
      message: "Checkout status request is invalid.",
      fieldErrors: {
        session_id: "session_id must be a valid Stripe Checkout Session ID.",
      },
    });
  }

  return ok(checkoutSessionId);
};

export const createCheckoutStatusHandler = (
  options: CheckoutStatusHandlerOptions = {},
) => {
  const readFulfillmentRecord =
    options.readFulfillmentRecord ?? readPaidVoteFulfillmentRecord;

  return async (request: Request) => {
    const url = new URL(request.url);
    const validationResult = validateCheckoutSessionId(
      url.searchParams.get("session_id"),
    );

    if (validationResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: validationResult.error,
        },
        { status: 400 },
      );
    }

    const fulfillmentResult = await readFulfillmentRecord(
      validationResult.value,
    );

    if (fulfillmentResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: toCheckoutStatusStorageResponseError(
            fulfillmentResult.error,
          ),
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: true,
        data: toCheckoutStatusResponseData(fulfillmentResult.value),
      },
      { status: 200 },
    );
  };
};

export const handleCheckoutStatus = createCheckoutStatusHandler();

const toCheckoutStatusResponseData = (
  result: PaidVoteFulfillmentReadResult,
) => {
  if (result.status !== "applied") {
    return {
      status: result.status,
    };
  }

  return {
    status: "applied" as const,
    countryCode: result.countryCode,
    voteType: result.voteType,
    ...(result.totals === undefined ? {} : { totals: result.totals }),
  };
};

const toCheckoutStatusStorageResponseError = (
  error: RedisPaidVoteFulfillmentError,
) => {
  if (error.code === "missing_redis_config") {
    return {
      code: error.code,
      message: error.message,
      envVar: error.envVar,
    };
  }

  if (error.code === "malformed_paid_vote_fulfillment") {
    return {
      code: error.code,
      message: error.message,
      checkoutSessionId: error.checkoutSessionId,
    };
  }

  return {
    code: error.code,
    message: error.message,
  };
};
