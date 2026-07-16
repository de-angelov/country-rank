import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";

import styles from "./top-disliked.module.css";
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
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Top Disliked Countries</h1>
        <p>Countries ordered by the highest dislike counts.</p>
      </header>

      <ol className={styles.list} aria-label="Countries ranked by dislikes">
        {countries.map((country, index) => (
          <li className={styles.item} key={country.code}>
            <span className={styles.rank}>Rank {index + 1}</span>
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
