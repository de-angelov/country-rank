import { sortBy } from "remeda";

import type { Country } from "~/countries";
import { readCountriesWithRedisVoteTotals } from "~/countries/redis-totals.server";

type ReadCountriesWithRedisVoteTotals = typeof readCountriesWithRedisVoteTotals;

export function getTopLikedCountries(
  countries: readonly Country[],
): readonly Country[] {
  return sortBy(countries, [(country) => country.likes, "desc"]);
}

export async function loadTopLikedCountries(
  readCountries: ReadCountriesWithRedisVoteTotals = readCountriesWithRedisVoteTotals,
): Promise<readonly Country[]> {
  const result = await readCountries();

  if (result.isErr()) {
    throw new Response(result.error.message, {
      status: 500,
      statusText: "Failed to load country rankings.",
    });
  }

  return getTopLikedCountries(result.value);
}
