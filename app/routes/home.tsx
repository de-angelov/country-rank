import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { CountryCard } from "~/components/country-card";
import { countryFixtures, type Country } from "~/countries";

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

export function HomeContent({ initialSearch = "" }: { initialSearch?: string }) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const filteredCountries = useMemo(
    () => filterCountriesByName(countryFixtures, searchQuery),
    [searchQuery],
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
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Country name"
              className="h-12 w-full rounded-base border-2 border-border bg-secondary-background py-2 pl-10 pr-3 text-base shadow-shadow outline-hidden focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <p className="text-sm" aria-live="polite">
        Showing {resultCount} {resultCount === 1 ? "country" : "countries"}
      </p>

      {resultCount > 0 ? (
        <section
          aria-label="Countries"
          className="grid gap-4 lg:grid-cols-2"
        >
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
    </main>
  );
}

export default function Home() {
  return <HomeContent />;
}
