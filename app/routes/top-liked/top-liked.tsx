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
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid gap-2">
        <h1 className="text-3xl font-heading sm:text-4xl">
          Top Liked Countries
        </h1>
        <p className="max-w-2xl text-base">
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
