import { sortBy } from "remeda";

import { CountryCard } from "~/components/country-card/country-card";
import { countryFixtures, type Country } from "~/countries";

import styles from "./top-liked.module.css";

const noopVoteHandler = () => {};

export function getTopLikedCountries(): Country[] {
  return sortBy(countryFixtures, [(country) => country.likes, "desc"]);
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

export function TopLikedContent() {
  const countries = getTopLikedCountries();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Top Liked Countries</h1>
        <p>Countries ordered by the highest fixture like counts.</p>
      </header>

      <ol className={styles.list} aria-label="Countries ranked by likes">
        {countries.map((country) => (
          <li key={country.code}>
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
  return <TopLikedContent />;
}
