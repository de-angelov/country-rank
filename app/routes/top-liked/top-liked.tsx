import { useLoaderData } from "react-router";

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
    { title: "Top Liked Countries | Country Ranking" },
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
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-6 pt-4 sm:px-6 sm:pt-5 lg:px-8">
      <header className="grid gap-1">
        <h1 className="text-2xl font-heading sm:text-3xl">
          Top Liked Countries
        </h1>
        <p className="max-w-2xl text-sm sm:text-base">
          Countries ordered by the highest like counts.
        </p>
      </header>

      <RankedCountriesList
        ariaLabel="Countries ranked by likes"
        countries={countries}
        rankTone="like"
      />
    </main>
  );
}

export default function TopLiked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopLikedContent countries={countries} />;
}
