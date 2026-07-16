import { sortBy } from "remeda";

import { CountryCard } from "~/components/country-card";
import { countryFixtures, type Country } from "~/countries";

import styles from "./top-disliked.module.css";

const noopVoteHandler = () => {};

export function getTopDislikedCountries(): Country[] {
  return sortBy(countryFixtures, [(country) => country.dislikes, "desc"]);
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

export function TopDislikedContent() {
  const countries = getTopDislikedCountries();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Top Disliked Countries</h1>
        <p>Countries ordered by the highest fixture dislike counts.</p>
      </header>

      <ol className={styles.list} aria-label="Countries ranked by dislikes">
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

export default function TopDisliked() {
  return <TopDislikedContent />;
}
