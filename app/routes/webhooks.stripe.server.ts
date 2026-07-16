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
  type AppliedPaidVote,
  type PaidVoteApplicationError,
  type ValidatedPaidVote,
} from "~/votes/paid-application.server";

const stripeSignatureHeader = "stripe-signature";

type ApplyPaidVote = (
  vote: ValidatedPaidVote,
) => ReturnType<typeof applyPaidVote>;

type StripeWebhookHandlerOptions = Readonly<{
  applyPaidVote?: ApplyPaidVote;
}>;

export const createStripeWebhookHandler = (
  options: StripeWebhookHandlerOptions = {},
) => {
  const applyVerifiedPaidVote = options.applyPaidVote ?? applyPaidVote;

  return async (request: Request) => {
    const result = verifyStripeWebhookSignature(
      await request.text(),
      request.headers.get(stripeSignatureHeader),
    );

    if (result.isErr()) {
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
      return Response.json(
        {
          ok: false,
          error: toStripeWebhookMetadataResponseError(metadataResult.error),
        },
        { status: 400 },
      );
    }

    const applicationResult = await applyVerifiedPaidVote(metadataResult.value);

    if (applicationResult.isErr()) {
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
          status: "applied",
          event: toStripeWebhookResponseEvent(event),
          vote: toStripeWebhookAppliedVoteResponse(applicationResult.value),
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
) => ({
  code: error.code,
  message: error.message,
  cause: {
    code: error.cause.code,
    message: error.cause.message,
  },
});

const toStripeWebhookResponseEvent = (event: VerifiedStripeWebhookEvent) => ({
  id: event.id,
  type: event.type,
});

const toStripeWebhookAppliedVoteResponse = (vote: AppliedPaidVote) => ({
  countryCode: vote.countryCode,
  voteType: vote.voteType,
  totals: vote.totals,
});
