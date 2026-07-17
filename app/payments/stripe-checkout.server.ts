import { err, ok, type Result } from "neverthrow";

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
