import { ResultAsync } from "neverthrow";

import type { Country } from "./country";
import { countryFixtures } from "./fixtures";
import {
  readCountryVoteTotals,
  type RedisVoteStorageError,
  type VoteTotals,
} from "~/votes/storage.server";

type ReadCountryVoteTotals = (
  countryCode: string,
) => ResultAsync<VoteTotals, RedisVoteStorageError>;

export type RedisCountryTotalsLoaderOptions = Readonly<{
  countries?: readonly Country[];
  readVoteTotals?: ReadCountryVoteTotals;
}>;

export const readCountriesWithRedisVoteTotals = (
  options: RedisCountryTotalsLoaderOptions = {},
): ResultAsync<readonly Country[], RedisVoteStorageError> => {
  const countries = options.countries ?? countryFixtures;
  const readVoteTotals = options.readVoteTotals ?? readCountryVoteTotals;

  return ResultAsync.combine(
    countries.map((country) =>
      readVoteTotals(country.code).map((totals) => ({
        ...country,
        likes: totals.likes,
        dislikes: totals.dislikes,
      })),
    ),
  );
};
