import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import type { Country } from "~/countries";

import styles from "./top-liked.module.css";
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
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Top Liked Countries</h1>
        <p>Countries ordered by the highest like counts.</p>
      </header>

      <ol className={styles.list} aria-label="Countries ranked by likes">
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

export default function TopLiked() {
  const { countries } = useLoaderData<typeof loader>();

  return <TopLikedContent countries={countries} />;
}
