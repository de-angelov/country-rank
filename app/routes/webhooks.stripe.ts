import type { Route } from "./+types/webhooks.stripe";

import {
  verifyStripeWebhookSignature,
  type StripeWebhookVerificationError,
} from "~/payments/stripe-webhook.server";

const stripeSignatureHeader = "stripe-signature";

const handleStripeWebhook = async (request: Request) => {
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

  return Response.json(
    {
      ok: true,
      data: {
        status: "verified",
        event: result.value,
      },
    },
    { status: 200 },
  );
};

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

export async function action({ request }: Route.ActionArgs) {
  return handleStripeWebhook(request);
}
