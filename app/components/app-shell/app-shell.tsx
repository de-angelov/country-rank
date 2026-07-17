import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";

import moduleStyles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

const bannerImageSrc = "/images/country-ranking-banner-v6.png";

const styles = {
  root: "min-h-screen",
  header: "border-b-2 border-border bg-secondary-background",
  bannerFrame: "relative overflow-hidden border-b-2 border-border bg-background",
  bannerImage: "mx-auto block h-full max-h-full w-auto max-w-full object-contain",
  ribbon:
    "mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 max-md:flex-col max-md:items-stretch max-md:gap-2 sm:px-6 lg:px-8",
  brandLink:
    "inline-flex min-w-max text-sm font-heading text-inherit no-underline max-md:min-w-0 max-md:justify-center max-md:text-center sm:text-base",
  nav: "flex flex-1 flex-wrap items-center justify-end gap-2 max-md:justify-stretch",
  navButton: "h-9 min-w-28 px-3 max-md:min-w-0 max-md:flex-1 max-md:basis-28",
  content: "mx-auto w-full max-w-6xl",
} as const;

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
    <div className={styles.root}>
      <header
        className={styles.header}
        aria-label="Site header"
      >
        <div className={`${styles.bannerFrame} ${moduleStyles.bannerFrame}`}>
          <img
            className={moduleStyles.bannerImage}
            src={bannerImageSrc}
            alt="The Internet Judges Earth"
          />

          <p className={moduleStyles.bannerTagline} aria-label="Banner tagline">
            {bannerTagline}
          </p>
        </div>
        <div className={styles.ribbon}>
          <a
            className={styles.brandLink}
            href="/"
          >
            Country Ranking
          </a>
          <nav
            className={styles.nav}
            aria-label="Primary navigation"
          >
            {navigationLinks.map((link) => (
              <Button
                asChild
                className={styles.navButton}
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
