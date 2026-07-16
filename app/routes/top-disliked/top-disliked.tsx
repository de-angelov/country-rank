import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import { Badge } from "~/components/ui/badge";
import type { Country } from "~/countries";

import { loadTopDislikedCountries } from "./top-disliked.server";

const noopVoteHandler = () => {};

export async function loader() {
  return {
    countries: await loadTopDislikedCountries(),
  };
}

export function meta() {
  return [
    { title: "Top Disliked Countries | Country Ranking" },
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
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid gap-2">
        <h1 className="text-3xl font-heading sm:text-4xl">
          Top Disliked Countries
        </h1>
        <p className="max-w-2xl text-base">
          Countries ordered by the highest dislike counts.
        </p>
      </header>

      <ol
        className="grid list-none gap-5 p-0"
        aria-label="Countries ranked by dislikes"
      >
        {countries.map((country, index) => (
          <li
            className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-4"
            key={country.code}
          >
            <Badge size="rank">
              Rank {index + 1}
            </Badge>
            <CountryCard
              country={country}
              onLikeClick={noopVoteHandler}
              onDislikeClick={noopVoteHandler}
            />
          </li>
        ))}
      </ol>
    </main>
  );
}

export default function TopDisliked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopDislikedContent countries={countries} />;
}
