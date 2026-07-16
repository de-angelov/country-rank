import type { Route } from "./+types/webhooks.stripe";

import { handleStripeWebhook } from "./webhooks.stripe.server";

export async function action({ request }: Route.ActionArgs) {
  return handleStripeWebhook(request);
}
