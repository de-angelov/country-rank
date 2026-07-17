import { useLoaderData } from "react-router";

import { RankedCountriesList } from "~/components/ranked-countries-list/ranked-countries-list";
import type { Country } from "~/countries";

import { loadTopDislikedCountries } from "./top-disliked.server";

export async function loader() {
  return {
    countries: await loadTopDislikedCountries(),
  };
}

export function meta() {
  return [
    { title: "Top Disliked Countries | country-rank.online" },
    {
      name: "description",
      content: "Browse countries ordered by their total dislikes.",
    },
  ];
}

export function TopDislikedContent({
  countries,
}: {
  countries: readonly Country[];
}) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-6 pt-4 sm:px-6 sm:pt-5 lg:px-8">
      <header className="grid gap-1">
        <h1 className="text-2xl font-heading sm:text-3xl">
          Top Disliked Countries
        </h1>
        <p className="max-w-2xl text-sm sm:text-base">
          Countries ordered by the highest dislike counts.
        </p>
      </header>

      <RankedCountriesList
        ariaLabel="Countries ranked by dislikes"
        countries={countries}
        rankTone="dislike"
      />
    </main>
  );
}

export default function TopDisliked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopDislikedContent countries={countries} />;
}
