import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

const noopVoteHandler = () => {};
const styles = {
  list: "grid list-none gap-5 p-0",
  row: "grid gap-2 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:items-stretch sm:gap-4 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]",
  rankMarker:
    "flex min-h-14 items-center justify-center whitespace-nowrap rounded-base border-2 border-border px-4 py-2 text-3xl font-heading leading-none text-main-foreground shadow-shadow sm:h-full sm:min-h-full sm:px-4 sm:py-4 sm:text-6xl",
  rankTone: {
    like: "bg-vote-like",
    dislike: "bg-vote-dislike",
  },
} as const;

type RankTone = keyof typeof styles.rankTone;

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
    <ol className={styles.list} aria-label={ariaLabel}>
      {countries.map((country, index) => (
        <li className={styles.row} key={country.code}>
          <div
            className={cn(styles.rankMarker, styles.rankTone[rankTone])}
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
