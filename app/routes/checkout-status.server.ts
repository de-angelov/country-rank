import { err, ok, type Result } from "neverthrow";

import {
  getStripeCheckoutConfig,
  getStripeCheckoutSessionPaymentStatus,
  type RetrieveStripeCheckoutSession,
  type StripeCheckoutRequestError,
  type StripeCheckoutSessionStatusError,
} from "~/payments/stripe-checkout.server";
import {
  applyPaidVote,
  type PaidVoteApplicationError,
} from "~/votes/paid-application.server";
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
type ApplyPaidVote = typeof applyPaidVote;

type CheckoutStatusReconciliationError =
  | StripeCheckoutRequestError
  | StripeCheckoutSessionStatusError
  | PaidVoteApplicationError;

type CheckoutStatusHandlerOptions = Readonly<{
  applyPaidVote?: ApplyPaidVote;
  env?: NodeJS.ProcessEnv;
  readFulfillmentRecord?: ReadPaidVoteFulfillmentRecord;
  retrieveCheckoutSession?: RetrieveStripeCheckoutSession;
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
  const applyResolvedPaidVote = options.applyPaidVote ?? applyPaidVote;
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

    const responseDataResult = await reconcileCheckoutStatusData(
      fulfillmentResult.value,
      {
        applyPaidVote: applyResolvedPaidVote,
        env: options.env,
        retrieveCheckoutSession: options.retrieveCheckoutSession,
      },
    );

    if (responseDataResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: toCheckoutStatusReconciliationResponseError(
            responseDataResult.error,
          ),
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        ok: true,
        data: responseDataResult.value,
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

const reconcileCheckoutStatusData = async (
  result: PaidVoteFulfillmentReadResult,
  options: Required<
    Pick<CheckoutStatusHandlerOptions, "applyPaidVote">
  > &
    Pick<CheckoutStatusHandlerOptions, "env" | "retrieveCheckoutSession">,
): Promise<
  Result<
    ReturnType<typeof toCheckoutStatusResponseData>,
    CheckoutStatusReconciliationError
  >
> => {
  if (result.status !== "pending") {
    return ok(toCheckoutStatusResponseData(result));
  }

  const configResult = getStripeCheckoutConfig(options.env);

  if (configResult.isErr()) {
    return err(configResult.error);
  }

  const sessionStatusResult = await getStripeCheckoutSessionPaymentStatus(
    result.checkoutSessionId,
    {
      config: configResult.value,
      retrieveSession: options.retrieveCheckoutSession,
    },
  );

  if (sessionStatusResult.isErr()) {
    return err(sessionStatusResult.error);
  }

  if (sessionStatusResult.value.status !== "paid") {
    return ok(toCheckoutStatusResponseData(result));
  }

  const applicationResult = await options.applyPaidVote({
    checkoutSessionId: sessionStatusResult.value.checkoutSessionId,
    countryCode: sessionStatusResult.value.countryCode,
    voteType: sessionStatusResult.value.voteType,
  });

  if (applicationResult.isErr()) {
    return err(applicationResult.error);
  }

  return ok(toCheckoutStatusResponseData(applicationResult.value));
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

const toCheckoutStatusReconciliationResponseError = (
  error: CheckoutStatusReconciliationError,
) => {
  if (
    error.code === "missing_stripe_checkout_config" ||
    error.code === "invalid_stripe_checkout_request"
  ) {
    return {
      code: error.code,
      message: error.message,
    };
  }

  if (error.code === "invalid_stripe_checkout_session_metadata") {
    return {
      code: error.code,
      message: error.message,
      checkoutSessionId: error.checkoutSessionId,
      cause: {
        code: error.cause.code,
        message: error.cause.message,
        fieldErrors: error.cause.fieldErrors,
      },
    };
  }

  if (error.code === "stripe_checkout_session_retrieval_failed") {
    return {
      code: error.code,
      message: error.message,
      checkoutSessionId: error.checkoutSessionId,
    };
  }

  if (
    error.code === "paid_vote_fulfillment_read_failed" ||
    error.code === "paid_vote_fulfillment_write_failed"
  ) {
    return {
      code: error.code,
      message: error.message,
      checkoutSessionId: error.checkoutSessionId,
      cause: {
        code: error.cause.code,
        message: error.cause.message,
      },
    };
  }

  return {
    code: error.code,
    message: error.message,
    cause: {
      code: error.cause.code,
      message: error.cause.message,
    },
  };
};
