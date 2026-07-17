import { ResultAsync } from "neverthrow";

import type { Country } from "./country";
import {
  readCountryCatalog,
  type CountryCatalogProfile,
  type RedisCountryCatalogError,
} from "./redis-catalog.server";
import {
  readAllCountryVoteTotals,
  type RedisVoteStorageError,
  type VoteTotalsByCountry,
} from "~/votes/storage.server";

type ReadCountryCatalog = () => ResultAsync<
  readonly CountryCatalogProfile[],
  RedisCountryCatalogError
>;

type ReadAllCountryVoteTotals = () => ResultAsync<
  VoteTotalsByCountry,
  RedisVoteStorageError
>;

export type RedisCountryTotalsLoaderError =
  | RedisCountryCatalogError
  | RedisVoteStorageError;

export type RedisCountryTotalsLoaderOptions = Readonly<{
  readCatalog?: ReadCountryCatalog;
  readVoteTotals?: ReadAllCountryVoteTotals;
}>;

export const readCountriesWithRedisVoteTotals = (
  options: RedisCountryTotalsLoaderOptions = {},
): ResultAsync<readonly Country[], RedisCountryTotalsLoaderError> => {
  const readCatalog = options.readCatalog ?? readCountryCatalog;
  const readVoteTotals = options.readVoteTotals ?? readAllCountryVoteTotals;

  return ResultAsync.combine(
    [
      readCatalog(),
      readVoteTotals(),
    ],
  ).map(([catalog, voteTotalsByCountry]) =>
    catalog.map((profile) => {
      const totals = voteTotalsByCountry.get(profile.code);

      return {
        ...profile,
        likes: totals?.likes ?? 0,
        dislikes: totals?.dislikes ?? 0,
      };
    }),
  );
};
