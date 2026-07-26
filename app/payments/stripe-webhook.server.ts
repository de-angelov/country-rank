import { err, ok, type Result } from "neverthrow";
import { pipe } from "remeda";
import Stripe from "stripe";

import { parseServerEnv } from "~/config/server-env.server";

const stripeWebhookSecretEnvVar = "STRIPE_WEBHOOK_SECRET";

export type StripeWebhookConfig = Readonly<{
  webhookSecret: string;
}>;

export type StripeWebhookVerificationError =
  | Readonly<{
      code: "missing_stripe_webhook_config";
      message: string;
      envVar: typeof stripeWebhookSecretEnvVar;
    }>
  | Readonly<{
      code: "missing_stripe_signature";
      message: string;
    }>
  | Readonly<{
      code: "invalid_stripe_signature";
      message: string;
      cause: unknown;
    }>
  | Readonly<{
      code: "invalid_stripe_checkout_session_id";
      message: string;
      fieldErrors: Readonly<{
        checkoutSessionId: string;
      }>;
    }>;

export type VerifiedStripeWebhookEvent = Readonly<{
  id: string;
  type: string;
  checkoutSessionId: string | null;
  metadata: Readonly<Record<string, string>> | null;
}>;

export type StripeWebhookSignatureVerifier = (
  payload: string,
  signature: string | null,
) => Result<VerifiedStripeWebhookEvent, StripeWebhookVerificationError>;

export const stripePaidVoteSuccessEventType = "checkout.session.completed";
const stripeCheckoutSessionIdPattern = /^cs_(test|live)_[A-Za-z0-9_]+$/;

export const getStripeWebhookConfigFromEnv = (
  env: NodeJS.ProcessEnv,
): Result<StripeWebhookConfig, StripeWebhookVerificationError> => {
  const webhookSecret = env[stripeWebhookSecretEnvVar]?.trim();

  if (!webhookSecret) {
    return err({
      code: "missing_stripe_webhook_config",
      message: `${stripeWebhookSecretEnvVar} must be set to verify Stripe webhooks.`,
      envVar: stripeWebhookSecretEnvVar,
    });
  }

  return ok({ webhookSecret });
};

export const getDefaultStripeWebhookConfig = (): Result<
  StripeWebhookConfig,
  StripeWebhookVerificationError
> =>
  parseServerEnv().match(
    (serverEnv) => ok({ webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET }),
    () =>
      err({
        code: "missing_stripe_webhook_config",
        message: `${stripeWebhookSecretEnvVar} must be set to verify Stripe webhooks.`,
        envVar: stripeWebhookSecretEnvVar,
      }),
  );

export const verifyStripeWebhookSignature = (
  payload: string,
  signature: string | null,
): Result<VerifiedStripeWebhookEvent, StripeWebhookVerificationError> =>
  verifyStripeWebhookSignatureWithConfigResult(
    payload,
    signature,
    getDefaultStripeWebhookConfig(),
  );

export const createDefaultStripeWebhookSignatureVerifier =
  (): StripeWebhookSignatureVerifier =>
  (payload, signature) =>
    verifyStripeWebhookSignatureWithConfigResult(
      payload,
      signature,
      getDefaultStripeWebhookConfig(),
    );

export const createStripeWebhookSignatureVerifierFromEnv = (
  env: NodeJS.ProcessEnv,
): StripeWebhookSignatureVerifier =>
  (payload, signature) =>
    verifyStripeWebhookSignatureWithConfigResult(
      payload,
      signature,
      getStripeWebhookConfigFromEnv(env),
    );

const verifyStripeWebhookSignatureWithConfigResult = (
  payload: string,
  signature: string | null,
  configResult: Result<StripeWebhookConfig, StripeWebhookVerificationError>,
) =>
  pipe(configResult, (result) =>
    result.andThen((config) =>
      verifyStripeWebhookSignatureWithConfig(payload, signature, config),
    ),
  );

export const verifyStripeWebhookSignatureWithConfig = (
  payload: string,
  signature: string | null,
  config: StripeWebhookConfig,
): Result<VerifiedStripeWebhookEvent, StripeWebhookVerificationError> => {
  if (!signature) {
    return err({
      code: "missing_stripe_signature",
      message: "Stripe-Signature header is required to verify the webhook.",
    });
  }

  let event: Stripe.Event;

  try {
    event = Stripe.webhooks.constructEvent(
      payload,
      signature,
      config.webhookSecret,
    );
  } catch (cause) {
    return err({
      code: "invalid_stripe_signature",
      message: "Stripe webhook signature verification failed.",
      cause,
    });
  }

  const eventDetailsResult = getVerifiedEventDetails(event);

  if (eventDetailsResult.isErr()) {
    return err(eventDetailsResult.error);
  }

  return ok({
    id: event.id,
    type: event.type,
    ...eventDetailsResult.value,
  });
};

const getVerifiedEventDetails = (
  event: Stripe.Event,
): Result<
  Pick<VerifiedStripeWebhookEvent, "checkoutSessionId" | "metadata">,
  StripeWebhookVerificationError
> => {
  if (event.type !== stripePaidVoteSuccessEventType) {
    return ok({
      checkoutSessionId: null,
      metadata: null,
    });
  }

  const eventObject = event.data.object as Partial<Stripe.Checkout.Session>;
  const checkoutSessionId = eventObject.id;

  if (
    !checkoutSessionId ||
    !stripeCheckoutSessionIdPattern.test(checkoutSessionId)
  ) {
    return err({
      code: "invalid_stripe_checkout_session_id",
      message: "Stripe checkout session ID is invalid.",
      fieldErrors: {
        checkoutSessionId:
          "checkout.session.completed events must include a valid Checkout Session ID.",
      },
    });
  }

  return ok({
    checkoutSessionId,
    metadata: eventObject.metadata ?? null,
  });
};
