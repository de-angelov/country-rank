import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";

import { loadHomeCountries } from "./home.server";
import styles from "./home.module.css";

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
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Countries</h1>
          <p>
            Browse the current country rankings and narrow the list by country
            name.
          </p>
        </div>

        <div className={styles.search}>
          <label className={styles.searchLabel} htmlFor="country-search">
            Search countries
          </label>
          <div className={styles.searchField}>
            <Search
              aria-hidden="true"
              className={styles.searchIcon}
            />
            <input
              id="country-search"
              name="country-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Country name"
              className={styles.searchInput}
            />
          </div>
        </div>
      </div>

      <p className={styles.resultCount} aria-live="polite">
        Showing {resultCount} {resultCount === 1 ? "country" : "countries"}
      </p>

      {resultCount > 0 ? (
        <section
          aria-label="Countries"
          className={styles.countryGrid}
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
        <p className={styles.emptyState}>
          No countries match that search.
        </p>
      )}
    </main>
  );
}

export default function Home() {
  const { countries } = useLoaderData<typeof loader>();

  return <HomeCountriesContent countries={countries} />;
}
