import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";

import styles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

const bannerImageSrc = "/images/country-ranking-banner-placeholder.svg";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header} aria-label="Site header">
        <div className={styles.banner}>
          <img
            className={styles.bannerImage}
            src={bannerImageSrc}
            alt="The Internet Judges Earth"
          />
        </div>
        <div className={styles.ribbon}>
          <a className={styles.brand} href="/">
            Country Ranking
          </a>
          <p className={styles.tagline}>Rankings Without Borders</p>
          <nav className={styles.nav} aria-label="Primary navigation">
            {navigationLinks.map((link) => (
              <Button
                asChild
                className={styles.navLink}
                key={link.href}
                variant="neutral"
              >
                <a href={link.href}>{link.label}</a>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
