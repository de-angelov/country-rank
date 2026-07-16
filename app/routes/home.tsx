import styles from "./home.module.css";

export function meta() {
  return [
    { title: "Country Ranking" },
    { name: "description", content: "Browse and vote on country rankings." },
  ];
}

export function HomeContent() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <h1>Country Ranking</h1>
        <p>React Router is ready for country rankings and voting flows.</p>
      </section>
    </main>
  );
}

export default function Home() {
  return <HomeContent />;
}
