import { err, ok, ResultAsync, type Result } from "neverthrow";
import Stripe from "stripe";

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
  checkoutUrl: string;
}>;

export type StripeCheckoutSessionError = Readonly<{
  code: "stripe_checkout_session_creation_failed";
  message: string;
  cause: unknown;
}>;

type StripeCheckoutSessionCreateParams = Stripe.Checkout.SessionCreateParams;
type StripeCheckoutSessionCreateResult = Pick<Stripe.Checkout.Session, "url">;

export type CreateStripeCheckoutSession = (
  params: StripeCheckoutSessionCreateParams,
) => Promise<StripeCheckoutSessionCreateResult>;

export type StripeCheckoutSessionOptions = Readonly<{
  config: StripeCheckoutConfig;
  appBaseUrl: string;
  createSession?: CreateStripeCheckoutSession;
}>;

export const getStripeCheckoutConfig = (
  env: NodeJS.ProcessEnv = process.env,
): Result<StripeCheckoutConfig, StripeCheckoutRequestError> => {
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

export const validateStripeCheckoutRequest = (
  payload: VoteRequestPayload,
  env: NodeJS.ProcessEnv = process.env,
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
      checkoutUrl: session.url,
    });
  });
};

const createStripeSessionCreator = (
  config: StripeCheckoutConfig,
): CreateStripeCheckoutSession => {
  const stripe = new Stripe(config.secretKey);

  return (params) => stripe.checkout.sessions.create(params);
};

const buildStripeCheckoutSessionParams = (
  checkoutRequest: StripeCheckoutRequest,
  appBaseUrl: string,
): StripeCheckoutSessionCreateParams => ({
  mode: "payment",
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
  success_url: `${normalizeAppBaseUrl(appBaseUrl)}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${normalizeAppBaseUrl(appBaseUrl)}/`,
});

const stripeCheckoutUnitAmount = {
  like: 100,
  dislike: 200,
} satisfies Record<VoteKind, number>;

const normalizeAppBaseUrl = (appBaseUrl: string) =>
  appBaseUrl.replace(/\/+$/, "");
