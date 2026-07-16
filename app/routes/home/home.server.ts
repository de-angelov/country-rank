import type { Country } from "~/countries";
import { readCountriesWithRedisVoteTotals } from "~/countries/redis-totals.server";

type ReadCountriesWithRedisVoteTotals = typeof readCountriesWithRedisVoteTotals;

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
