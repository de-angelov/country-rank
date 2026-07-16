import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";

import styles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

const bannerImageSrc = "/images/country-ranking-banner-placeholder.svg";

export const bannerTaglines = [
  "Rankings Without Borders",
  "Global Rankings. Local Beef.",
  "The Internet Judges Earth.",
  "Diplomacy Not Included.",
  "No Chill. Just Rankings.",
  "Earth, Reviewed.",
  "Petty by Popular Vote.",
] as const;

export function pickBannerTagline(random = Math.random): string {
  const taglineIndex = Math.min(
    Math.floor(random() * bannerTaglines.length),
    bannerTaglines.length - 1,
  );

  return bannerTaglines[taglineIndex];
}

export function AppShell({ children }: { children: ReactNode }) {
  const [bannerTagline, setBannerTagline] = useState<string>(bannerTaglines[0]);

  useEffect(() => {
    setBannerTagline(pickBannerTagline());
  }, []);

  return (
    <div className={styles.shell}>
      <header className={styles.header} aria-label="Site header">
        <div className={styles.banner}>
          <img
            className={styles.bannerImage}
            src={bannerImageSrc}
            alt="The Internet Judges Earth"
          />
          <p className={styles.bannerTagline} aria-label="Banner tagline">
            {bannerTagline}
          </p>
        </div>
        <div className={styles.ribbon}>
          <a className={styles.brand} href="/">
            Country Ranking
          </a>
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
