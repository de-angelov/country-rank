import { CountryCard } from "~/components/country-card/country-card";
import { Badge } from "~/components/ui/badge";
import type { Country } from "~/countries";

const noopVoteHandler = () => {};

export function RankedCountriesList({
  ariaLabel,
  countries,
}: {
  ariaLabel: string;
  countries: readonly Country[];
}) {
  return (
    <ol className="grid list-none gap-5 p-0" aria-label={ariaLabel}>
      {countries.map((country, index) => (
        <li
          className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-4"
          key={country.code}
        >
          <Badge size="rank">Rank {index + 1}</Badge>
          <CountryCard
            country={country}
            onLikeClick={noopVoteHandler}
            onDislikeClick={noopVoteHandler}
          />
        </li>
      ))}
    </ol>
  );
}
