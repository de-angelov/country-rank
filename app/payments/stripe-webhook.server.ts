import { err, ok, type Result } from "neverthrow";
import Stripe from "stripe";

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

export const stripePaidVoteSuccessEventType = "checkout.session.completed";
const stripeCheckoutSessionIdPattern = /^cs_(test|live)_[A-Za-z0-9_]+$/;

export const getStripeWebhookConfig = (
  env: NodeJS.ProcessEnv = process.env,
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

export const verifyStripeWebhookSignature = (
  payload: string,
  signature: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Result<VerifiedStripeWebhookEvent, StripeWebhookVerificationError> => {
  const configResult = getStripeWebhookConfig(env);

  if (configResult.isErr()) {
    return err(configResult.error);
  }

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
      configResult.value.webhookSecret,
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
