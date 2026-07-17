import { logger, type ApplicationLogger } from "~/lib/logger.server";
import {
  parseStripePaidVoteMetadata,
  type StripePaidVoteMetadataError,
} from "~/payments/paid-vote-metadata.server";
import {
  stripePaidVoteSuccessEventType,
  type StripeWebhookVerificationError,
  type VerifiedStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from "~/payments/stripe-webhook.server";
import {
  applyPaidVote,
  type PaidVoteApplicationError,
  type PaidVoteApplicationResult,
  type ValidatedPaidVote,
} from "~/votes/paid-application.server";

const stripeSignatureHeader = "stripe-signature";

type ApplyPaidVote = (
  vote: ValidatedPaidVote,
) => ReturnType<typeof applyPaidVote>;

type StripeWebhookHandlerOptions = Readonly<{
  applyPaidVote?: ApplyPaidVote;
  logger?: ApplicationLogger;
}>;

export const createStripeWebhookHandler = (
  options: StripeWebhookHandlerOptions = {},
) => {
  const applyVerifiedPaidVote = options.applyPaidVote ?? applyPaidVote;
  const paymentLogger = options.logger ?? logger;

  return async (request: Request) => {
    const result = verifyStripeWebhookSignature(
      await request.text(),
      request.headers.get(stripeSignatureHeader),
    );

    if (result.isErr()) {
      paymentLogger.error(
        {
          route: "webhooks.stripe",
          action: "verify_stripe_webhook_signature",
          errorCode: result.error.code,
          ...getRequestLogContext(request),
        },
        "Stripe webhook verification failed.",
      );

      return Response.json(
        {
          ok: false,
          error: toStripeWebhookResponseError(result.error),
        },
        { status: toStripeWebhookResponseStatus(result.error) },
      );
    }

    const event = result.value;

    if (event.type !== stripePaidVoteSuccessEventType) {
      paymentLogger.info(
        {
          route: "webhooks.stripe",
          action: "ignore_stripe_webhook_event",
          eventId: event.id,
          eventType: event.type,
          ...getRequestLogContext(request),
        },
        "Ignored non-target Stripe webhook event.",
      );

      return Response.json(
        {
          ok: true,
          data: {
            status: "ignored",
            event: toStripeWebhookResponseEvent(event),
          },
        },
        { status: 200 },
      );
    }

    const metadataResult = parseStripePaidVoteMetadata(event.metadata);

    if (metadataResult.isErr()) {
      paymentLogger.error(
        {
          route: "webhooks.stripe",
          action: "parse_stripe_paid_vote_metadata",
          errorCode: metadataResult.error.code,
          eventId: event.id,
          eventType: event.type,
          checkoutSessionId: event.checkoutSessionId,
          ...getRequestLogContext(request),
        },
        "Stripe paid vote metadata was invalid.",
      );

      return Response.json(
        {
          ok: false,
          error: toStripeWebhookMetadataResponseError(metadataResult.error),
        },
        { status: 400 },
      );
    }

    const applicationResult = await applyVerifiedPaidVote({
      checkoutSessionId: event.checkoutSessionId,
      ...metadataResult.value,
    });

    if (applicationResult.isErr()) {
      paymentLogger.error(
        {
          route: "webhooks.stripe",
          action: "apply_paid_vote",
          errorCode: applicationResult.error.code,
          causeCode: applicationResult.error.cause.code,
          eventId: event.id,
          eventType: event.type,
          checkoutSessionId: event.checkoutSessionId,
          countryCode: metadataResult.value.countryCode,
          voteType: metadataResult.value.voteType,
          ...getRequestLogContext(request),
        },
        "Failed to apply paid vote from Stripe webhook.",
      );

      return Response.json(
        {
          ok: false,
          error: toStripeWebhookApplicationResponseError(
            applicationResult.error,
          ),
        },
        { status: 500 },
      );
    }

    return Response.json(
      {
        ok: true,
        data: {
          status: applicationResult.value.status,
          event: toStripeWebhookResponseEvent(event),
          vote: toStripeWebhookPaidVoteResponse(applicationResult.value),
        },
      },
      { status: 200 },
    );
  };
};

export const handleStripeWebhook = createStripeWebhookHandler();

const toStripeWebhookResponseStatus = (
  error: StripeWebhookVerificationError,
) => (error.code === "missing_stripe_webhook_config" ? 500 : 400);

const toStripeWebhookResponseError = (
  error: StripeWebhookVerificationError,
) => {
  if (error.code === "missing_stripe_webhook_config") {
    return {
      code: error.code,
      message: error.message,
      envVar: error.envVar,
    };
  }

  return {
    code: error.code,
    message: error.message,
  };
};

const toStripeWebhookMetadataResponseError = (
  error: StripePaidVoteMetadataError,
) => ({
  code: error.code,
  message: error.message,
  fieldErrors: error.fieldErrors,
});

const toStripeWebhookApplicationResponseError = (
  error: PaidVoteApplicationError,
) => {
  const baseError = {
    code: error.code,
    message: error.message,
    cause: {
      code: error.cause.code,
      message: error.cause.message,
    },
  };

  if (
    error.code === "paid_vote_fulfillment_read_failed" ||
    error.code === "paid_vote_fulfillment_write_failed"
  ) {
    return {
      ...baseError,
      checkoutSessionId: error.checkoutSessionId,
    };
  }

  return baseError;
};

const toStripeWebhookResponseEvent = (event: VerifiedStripeWebhookEvent) => ({
  id: event.id,
  type: event.type,
  ...(event.checkoutSessionId
    ? { checkoutSessionId: event.checkoutSessionId }
    : {}),
});

const toStripeWebhookPaidVoteResponse = (vote: PaidVoteApplicationResult) => ({
  countryCode: vote.countryCode,
  voteType: vote.voteType,
  ...(vote.totals === undefined ? {} : { totals: vote.totals }),
});

const getRequestLogContext = (request: Request) => {
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id");

  return requestId ? { requestId } : {};
};
