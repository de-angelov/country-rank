import type { Route } from "./+types/checkout";

import { handleCheckout } from "./checkout.server";

export async function action({ request }: Route.ActionArgs) {
  return handleCheckout(request);
}
