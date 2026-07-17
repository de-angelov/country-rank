import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";

import {
  orderRankedCountries,
  RankingOrderControls,
  type RankingOrder,
} from "~/components/ranking-order-controls/ranking-order-controls";
import { RankedCountriesList } from "~/components/ranked-countries-list/ranked-countries-list";
import type { Country } from "~/countries";

import { loadTopLikedCountries } from "./top-liked.server";

export async function loader() {
  return {
    countries: await loadTopLikedCountries(),
  };
}

export function meta() {
  return [
    { title: "Top Liked Countries | country-rank.online" },
    {
      name: "description",
      content: "Browse countries ordered by their total likes.",
    },
  ];
}

export function TopLikedContent({
  countries,
}: {
  countries: readonly Country[];
}) {
  const [rankingOrder, setRankingOrder] =
    useState<RankingOrder>("highest-first");
  const orderedCountries = useMemo(
    () => orderRankedCountries(countries, rankingOrder),
    [countries, rankingOrder],
  );

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-6 pt-4 sm:px-6 sm:pt-5 lg:px-8">
      <div className="grid gap-3 md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end md:gap-4">
        <header className="grid gap-1">
          <h1 className="text-2xl font-heading sm:text-3xl">
            Top Liked Countries
          </h1>
          <p className="max-w-2xl text-sm sm:text-base">
            Countries ordered by the highest like counts.
          </p>
        </header>

        <RankingOrderControls
          currentOrder={rankingOrder}
          highestFirstLabel="Highest likes first"
          lowestFirstLabel="Lowest likes first"
          onOrderChange={setRankingOrder}
        />
      </div>

      <RankedCountriesList
        ariaLabel="Countries ranked by likes"
        countries={orderedCountries}
        rankTone="like"
      />
    </main>
  );
}

export default function TopLiked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopLikedContent countries={countries} />;
}
