import type { Route } from "./+types/checkout-status";

import { handleCheckoutStatus } from "./checkout-status.server";

export async function loader({ request }: Route.LoaderArgs) {
  return handleCheckoutStatus(request);
}
