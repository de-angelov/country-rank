import { err, ok, ResultAsync, type Result } from "neverthrow";
import Stripe from "stripe";

import { parseServerEnv } from "~/config/server-env.server";
import {
  parseStripePaidVoteMetadata,
  type StripePaidVoteMetadataError,
} from "~/payments/paid-vote-metadata.server";
import {
  validateVoteRequest,
  type VoteRequestPayload,
} from "~/votes/request.server";
import type { VoteKind } from "~/votes/storage.server";

const stripeSecretKeyEnvVar = "STRIPE_SECRET_KEY";

export type StripeCheckoutConfig = Readonly<{
  secretKey: string;
}>;

export type StripeCheckoutRequest = Readonly<{
  countryCode: string;
  voteType: VoteKind;
}>;

export type StripeCheckoutRequestError =
  | Readonly<{
      code: "missing_stripe_checkout_config";
      message: string;
      envVar: typeof stripeSecretKeyEnvVar;
    }>
  | Readonly<{
      code: "invalid_stripe_checkout_request";
      message: string;
      fieldErrors: Readonly<{
        countryCode?: string;
        voteType?: string;
      }>;
    }>;

export type StripeCheckoutRequestResult = Result<
  StripeCheckoutRequest,
  StripeCheckoutRequestError
>;

export type StripeCheckoutSessionSuccess = Readonly<{
  checkoutSessionId: string;
  checkoutUrl: string;
}>;

export type StripeCheckoutSessionError = Readonly<{
  code: "stripe_checkout_session_creation_failed";
  message: string;
  cause: unknown;
}>;

export type StripeCheckoutSessionPaymentStatus =
  | Readonly<{
      status: "paid";
      checkoutSessionId: string;
      countryCode: string;
      voteType: VoteKind;
    }>
  | Readonly<{
      status: "unpaid";
      checkoutSessionId: string;
    }>;

export type StripeCheckoutSessionStatusError =
  | Readonly<{
      code: "stripe_checkout_session_retrieval_failed";
      message: string;
      checkoutSessionId: string;
      cause: unknown;
    }>
  | Readonly<{
      code: "invalid_stripe_checkout_session_metadata";
      message: string;
      checkoutSessionId: string;
      cause: StripePaidVoteMetadataError;
    }>;

type StripeCheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams;
type StripeCheckoutSessionCreateResult = Pick<
  Stripe.Checkout.Session,
  "id" | "url"
>;
type StripeCheckoutSessionRetrieveResult = Pick<
  Stripe.Checkout.Session,
  "id" | "metadata" | "payment_status" | "status"
>;

export type CreateStripeCheckoutSession = (
  params: StripeCheckoutSessionCreateParams,
) => Promise<StripeCheckoutSessionCreateResult>;

export type RetrieveStripeCheckoutSession = (
  checkoutSessionId: string,
) => Promise<StripeCheckoutSessionRetrieveResult>;

export type StripeCheckoutSessionOptions = Readonly<{
  config: StripeCheckoutConfig;
  appBaseUrl: string;
  createSession?: CreateStripeCheckoutSession;
}>;

export type StripeCheckoutSessionStatusOptions = Readonly<{
  config: StripeCheckoutConfig;
  retrieveSession?: RetrieveStripeCheckoutSession;
}>;

export const getStripeCheckoutConfig = (
  env?: NodeJS.ProcessEnv,
): Result<StripeCheckoutConfig, StripeCheckoutRequestError> => {
  if (!env) {
    return getDefaultStripeCheckoutConfig();
  }

  const secretKey = env[stripeSecretKeyEnvVar]?.trim();

  if (!secretKey) {
    return err({
      code: "missing_stripe_checkout_config",
      message: `${stripeSecretKeyEnvVar} must be set to create Stripe checkout sessions.`,
      envVar: stripeSecretKeyEnvVar,
    });
  }

  return ok({ secretKey });
};

const getDefaultStripeCheckoutConfig = (): Result<
  StripeCheckoutConfig,
  StripeCheckoutRequestError
> =>
  parseServerEnv().match(
    (serverEnv) => ok({ secretKey: serverEnv.STRIPE_SECRET_KEY }),
    () =>
      err({
        code: "missing_stripe_checkout_config",
        message: `${stripeSecretKeyEnvVar} must be set to create Stripe checkout sessions.`,
        envVar: stripeSecretKeyEnvVar,
      }),
  );

export const validateStripeCheckoutRequest = (
  payload: VoteRequestPayload,
  env?: NodeJS.ProcessEnv,
): StripeCheckoutRequestResult => {
  const configResult = getStripeCheckoutConfig(env);

  if (configResult.isErr()) {
    return err(configResult.error);
  }

  const validationResult = validateVoteRequest(payload);

  if (validationResult.isErr()) {
    return err({
      code: "invalid_stripe_checkout_request",
      message: "Stripe checkout request payload is invalid.",
      fieldErrors: validationResult.error.fieldErrors,
    });
  }

  return ok({
    countryCode: validationResult.value.countryCode,
    voteType: validationResult.value.voteType,
  });
};

export const createStripeCheckoutSession = (
  checkoutRequest: StripeCheckoutRequest,
  options: StripeCheckoutSessionOptions,
): ResultAsync<StripeCheckoutSessionSuccess, StripeCheckoutSessionError> => {
  const createSession =
    options.createSession ?? createStripeSessionCreator(options.config);

  return ResultAsync.fromPromise(
    createSession(
      buildStripeCheckoutSessionParams(checkoutRequest, options.appBaseUrl),
    ),
    (cause) => ({
      code: "stripe_checkout_session_creation_failed" as const,
      message: "Failed to create Stripe checkout session.",
      cause,
    }),
  ).andThen((session) => {
    if (!session.url) {
      return err({
        code: "stripe_checkout_session_creation_failed",
        message: "Failed to create Stripe checkout session.",
        cause: new Error("Stripe checkout session did not include a URL."),
      });
    }

    return ok({
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
    });
  });
};

export const getStripeCheckoutSessionPaymentStatus = (
  checkoutSessionId: string,
  options: StripeCheckoutSessionStatusOptions,
): ResultAsync<
  StripeCheckoutSessionPaymentStatus,
  StripeCheckoutSessionStatusError
> => {
  const retrieveSession =
    options.retrieveSession ?? createStripeSessionRetriever(options.config);

  return ResultAsync.fromPromise(retrieveSession(checkoutSessionId), (cause) => ({
    code: "stripe_checkout_session_retrieval_failed" as const,
    message: "Failed to retrieve Stripe checkout session.",
    checkoutSessionId,
    cause,
  })).andThen((session) => {
    if (session.status !== "complete" || session.payment_status !== "paid") {
      return ok({
        status: "unpaid" as const,
        checkoutSessionId: session.id,
      });
    }

    const metadataResult = parseStripePaidVoteMetadata(session.metadata);

    if (metadataResult.isErr()) {
      return err({
        code: "invalid_stripe_checkout_session_metadata" as const,
        message: "Stripe checkout session metadata is invalid.",
        checkoutSessionId: session.id,
        cause: metadataResult.error,
      });
    }

    return ok({
      status: "paid" as const,
      checkoutSessionId: session.id,
      ...metadataResult.value,
    });
  });
};

const createStripeSessionCreator = (
  config: StripeCheckoutConfig,
): CreateStripeCheckoutSession => {
  const stripe = new Stripe(config.secretKey);

  return (params) => stripe.checkout.sessions.create(params);
};

const createStripeSessionRetriever = (
  config: StripeCheckoutConfig,
): RetrieveStripeCheckoutSession => {
  const stripe = new Stripe(config.secretKey);

  return (checkoutSessionId) => stripe.checkout.sessions.retrieve(checkoutSessionId);
};

const buildStripeCheckoutSessionParams = (
  checkoutRequest: StripeCheckoutRequest,
  appBaseUrl: string,
): StripeCheckoutSessionCreateParams => ({
  mode: "payment",
  managed_payments: {
    enabled: false,
  },
  line_items: [
    {
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: stripeCheckoutUnitAmount[checkoutRequest.voteType],
        product_data: {
          name: `Paid ${checkoutRequest.voteType} vote for ${checkoutRequest.countryCode}`,
        },
      },
    },
  ],
  metadata: {
    countryCode: checkoutRequest.countryCode,
    voteType: checkoutRequest.voteType,
  },
  success_url: buildStripeCheckoutSuccessUrl(appBaseUrl),
  cancel_url: buildStripeCheckoutCancelUrl(appBaseUrl),
});

const stripeCheckoutUnitAmount = {
  like: 100,
  dislike: 200,
} satisfies Record<VoteKind, number>;

export const buildStripeCheckoutSuccessUrl = (appBaseUrl: string) =>
  `${normalizeAppBaseUrl(appBaseUrl)}/?session_id={CHECKOUT_SESSION_ID}`;

export const buildStripeCheckoutCancelUrl = (appBaseUrl: string) =>
  `${normalizeAppBaseUrl(appBaseUrl)}/`;

const normalizeAppBaseUrl = (appBaseUrl: string) =>
  appBaseUrl.replace(/\/+$/, "");
