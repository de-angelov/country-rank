import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

const noopVoteHandler = () => {};
const rankToneClassNames = {
  like: "bg-vote-like",
  dislike: "bg-vote-dislike",
} as const;

type RankTone = keyof typeof rankToneClassNames;

export function RankedCountriesList({
  ariaLabel,
  countries,
  rankTone,
}: {
  ariaLabel: string;
  countries: readonly Country[];
  rankTone: RankTone;
}) {
  return (
    <ol className="grid list-none gap-5 p-0" aria-label={ariaLabel}>
      {countries.map((country, index) => (
        <li
          className="grid gap-2 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:items-stretch sm:gap-4 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]"
          key={country.code}
        >
          <div
            className={cn(
              "flex min-h-14 items-center justify-center whitespace-nowrap rounded-base border-2 border-border px-4 py-2 text-3xl font-heading leading-none text-main-foreground shadow-shadow sm:h-full sm:min-h-full sm:px-4 sm:py-4 sm:text-6xl",
              rankToneClassNames[rankTone],
            )}
            aria-label={`Rank ${index + 1}`}
          >
            {index + 1}
          </div>
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
