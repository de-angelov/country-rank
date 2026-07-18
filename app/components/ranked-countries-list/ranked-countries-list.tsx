import {
  CountryCard,
  CountryCardVoteIconSprite,
} from "~/components/country-card/country-card";
import type { Country } from "~/countries";
import { cn } from "~/lib/utils";

const styles = {
  list: "grid list-none gap-5 p-0",
  row: "grid gap-2 sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)] sm:items-stretch sm:gap-4 lg:grid-cols-[minmax(12rem,14rem)_minmax(0,1fr)]",
  rankMarker:
    "flex min-h-14 min-w-[4.5rem] items-center justify-center whitespace-nowrap rounded-base border-2 border-border px-4 py-2 text-7xl font-heading leading-none text-main-foreground shadow-shadow sm:h-full sm:min-h-full sm:px-4 sm:py-4",
  rankTone: {
    like: "bg-vote-like",
    dislike: "bg-vote-dislike",
  },
} as const;

type RankTone = keyof typeof styles.rankTone;
type RankNumberOrder = "highest-first" | "lowest-first";

export function getDisplayedRankNumber({
  index,
  order,
  total,
}: {
  index: number;
  order: RankNumberOrder;
  total: number;
}) {
  return order === "highest-first" ? index + 1 : total - index;
}

export function RankedCountriesList({
  ariaLabel,
  countries,
  rankNumberOrder = "highest-first",
  rankTone,
}: {
  ariaLabel: string;
  countries: readonly Country[];
  rankNumberOrder?: RankNumberOrder;
  rankTone: RankTone;
}) {
  return (
    <>
      <CountryCardVoteIconSprite />
      <ol className={styles.list} aria-label={ariaLabel}>
        {countries.map((country, index) => {
          const rankNumber = getDisplayedRankNumber({
            index,
            order: rankNumberOrder,
            total: countries.length,
          });

          return (
            <li className={styles.row} key={country.code}>
              <div
                className={cn(styles.rankMarker, styles.rankTone[rankTone])}
                aria-label={`Rank ${rankNumber}`}
              >
                {rankNumber}
              </div>
              <CountryCard country={country} includeVoteIconSprite={false} />
            </li>
          );
        })}
      </ol>
    </>
  );
}
