import type { Country } from "~/countries";
import { readCountriesWithRedisVoteTotals } from "~/countries/redis-totals.server";

import { handleCheckoutStatus } from "../checkout-status.server";
import {
  mapPaidVoteStatusResponseToHomeState,
  type HomePaidVoteConfirmationState,
  type PaidVoteStatusResponse,
} from "./paid-vote-confirmation-state";
import { getPaidVoteRedirectQueryState } from "./paid-vote-redirect-query";

type ReadCountriesWithRedisVoteTotals = typeof readCountriesWithRedisVoteTotals;
type HandleCheckoutStatus = (request: Request) => Response | Promise<Response>;

type LoadHomeRouteDataOptions = Readonly<{
  readCountries?: ReadCountriesWithRedisVoteTotals;
  handleCheckoutStatus?: HandleCheckoutStatus;
}>;

export type HomeRouteData = Readonly<{
  countries: readonly Country[];
  paidVoteConfirmation?: HomePaidVoteConfirmationState;
}>;

export async function loadHomeCountries(
  readCountries: ReadCountriesWithRedisVoteTotals = readCountriesWithRedisVoteTotals,
): Promise<readonly Country[]> {
  const result = await readCountries();

  if (result.isErr()) {
    throw new Response(result.error.message, {
      status: 500,
      statusText: "Failed to load country rankings.",
    });
  }

  return result.value;
}

export async function loadHomePaidVoteConfirmationState(
  request: Request,
  checkStatus: HandleCheckoutStatus = handleCheckoutStatus,
): Promise<HomePaidVoteConfirmationState | undefined> {
  const redirectQueryState = getPaidVoteRedirectQueryState(request.url);

  if (redirectQueryState.status === "absent") {
    return undefined;
  }

  const checkoutStatusResponse = await checkStatus(
    createCheckoutStatusRequest(request, redirectQueryState.sessionId),
  );
  const paidVoteStatus = await readPaidVoteStatusResponse(
    checkoutStatusResponse,
  );

  return mapPaidVoteStatusResponseToHomeState(paidVoteStatus);
}

export async function loadHomeRouteData(
  request: Request,
  options: LoadHomeRouteDataOptions = {},
): Promise<HomeRouteData> {
  const countries = await loadHomeCountries(options.readCountries);
  const paidVoteConfirmation = await loadHomePaidVoteConfirmationState(
    request,
    options.handleCheckoutStatus,
  );

  return {
    countries,
    ...(paidVoteConfirmation === undefined ? {} : { paidVoteConfirmation }),
  };
}

function createCheckoutStatusRequest(request: Request, sessionId: string) {
  const checkoutStatusUrl = new URL("/checkout-status", request.url);
  checkoutStatusUrl.searchParams.set("session_id", sessionId);

  return new Request(checkoutStatusUrl, {
    headers: request.headers,
  });
}

async function readPaidVoteStatusResponse(response: Response) {
  try {
    return (await response.json()) as PaidVoteStatusResponse;
  } catch {
    throw new Response("Failed to load paid vote status.", {
      status: 502,
      statusText: "Failed to load paid vote status.",
    });
  }
}
