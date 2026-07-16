import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";

import { loadTopLikedCountries } from "./top-liked.server";

const noopVoteHandler = () => {};

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

      <ol
        className="grid list-none gap-5 p-0"
        aria-label="Countries ranked by likes"
      >
        {countries.map((country, index) => (
          <li
            className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-4"
            key={country.code}
          >
            <span className="w-fit min-w-[4.75rem] rounded-base border-2 border-border bg-main px-3 py-2 text-center font-heading leading-none text-main-foreground shadow-shadow">
              Rank {index + 1}
            </span>
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

export default function TopLiked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopLikedContent countries={countries} />;
}
