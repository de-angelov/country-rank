import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Search } from "lucide-react";
import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";

import { loadHomeCountries } from "./home.server";

export async function loader() {
  return {
    countries: await loadHomeCountries(),
  };
}

export function meta() {
  return [
    { title: "Country Ranking" },
    { name: "description", content: "Search and browse country rankings." },
  ];
}

export function filterCountriesByName(
  countries: readonly Country[],
  searchQuery: string,
) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return countries;
  }

  return countries.filter((country) =>
    country.name.toLocaleLowerCase().includes(normalizedQuery),
  );
}

const ignoreVoteClick = () => undefined;

type SearchViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => unknown;
};

function updateSearchQueryWithTransition(
  nextSearchQuery: string,
  setSearchQuery: (nextSearchQuery: string) => void,
) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canStartViewTransition =
    typeof document !== "undefined" &&
    !prefersReducedMotion &&
    (document as SearchViewTransitionDocument).startViewTransition !==
      undefined;

  if (!canStartViewTransition) {
    setSearchQuery(nextSearchQuery);
    return;
  }

  (document as SearchViewTransitionDocument).startViewTransition?.(() => {
    flushSync(() => setSearchQuery(nextSearchQuery));
  });
}

export function HomeCountriesContent({
  countries,
  initialSearch = "",
}: {
  countries: readonly Country[];
  initialSearch?: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const filteredCountries = useMemo(
    () => filterCountriesByName(countries, searchQuery),
    [countries, searchQuery],
  );
  const resultCount = filteredCountries.length;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="grid gap-4 md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end">
        <div>
          <h1 className="text-3xl font-heading sm:text-4xl">Countries</h1>
          <p className="mt-2 max-w-2xl text-base">
            Browse the current country rankings and narrow the list by country
            name.
          </p>
        </div>

        <div className="grid gap-2">
          <label className="font-heading text-sm" htmlFor="country-search">
            Search countries
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
            />
            <input
              id="country-search"
              name="country-search"
              type="search"
              value={searchQuery}
              onChange={(event) =>
                updateSearchQueryWithTransition(
                  event.currentTarget.value,
                  setSearchQuery,
                )
              }
              placeholder="Country name"
              className="h-12 w-full rounded-base border-2 border-border bg-secondary-background py-2 pl-10 pr-3 text-base shadow-shadow outline-hidden focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div className="country-filter-transition grid gap-6">
        <p className="text-sm" aria-live="polite">
          Showing {resultCount} {resultCount === 1 ? "country" : "countries"}
        </p>

        {resultCount > 0 ? (
          <section aria-label="Countries" className="grid gap-4 lg:grid-cols-2">
            {filteredCountries.map((country) => (
              <CountryCard
                country={country}
                key={country.code}
                onDislikeClick={ignoreVoteClick}
                onLikeClick={ignoreVoteClick}
              />
            ))}
          </section>
        ) : (
          <p className="rounded-base border-2 border-border bg-secondary-background p-4">
            No countries match that search.
          </p>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  const { countries } = useLoaderData<typeof loader>();

  return <HomeCountriesContent countries={countries} />;
}
