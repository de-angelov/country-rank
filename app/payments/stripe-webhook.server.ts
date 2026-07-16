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
    }>;

export type VerifiedStripeWebhookEvent = Readonly<{
  id: string;
  type: string;
  metadata: Readonly<Record<string, string>> | null;
}>;

export const stripePaidVoteSuccessEventType = "checkout.session.completed";

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

  try {
    const event = Stripe.webhooks.constructEvent(
      payload,
      signature,
      configResult.value.webhookSecret,
    );

    return ok({
      id: event.id,
      type: event.type,
      metadata: getVerifiedEventMetadata(event),
    });
  } catch (cause) {
    return err({
      code: "invalid_stripe_signature",
      message: "Stripe webhook signature verification failed.",
      cause,
    });
  }
};

const getVerifiedEventMetadata = (
  event: Stripe.Event,
): Readonly<Record<string, string>> | null => {
  if (event.type !== stripePaidVoteSuccessEventType) {
    return null;
  }

  const eventObject = event.data.object as Stripe.Checkout.Session;

  return eventObject.metadata ?? null;
};
