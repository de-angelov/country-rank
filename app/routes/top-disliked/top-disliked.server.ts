import { sortBy } from "remeda";

import type { Country } from "~/countries";
import { readCountriesWithRedisVoteTotals } from "~/countries/redis-totals.server";

type ReadCountriesWithRedisVoteTotals = typeof readCountriesWithRedisVoteTotals;

export function getTopDislikedCountries(
  countries: readonly Country[],
): readonly Country[] {
  return sortBy(countries, [(country) => country.dislikes, "desc"]);
}

export async function loadTopDislikedCountries(
  readCountries: ReadCountriesWithRedisVoteTotals = readCountriesWithRedisVoteTotals,
): Promise<readonly Country[]> {
  const result = await readCountries();

  if (result.isErr()) {
    throw new Response(result.error.message, {
      status: 500,
      statusText: "Failed to load country rankings.",
    });
  }

  return getTopDislikedCountries(result.value);
}
