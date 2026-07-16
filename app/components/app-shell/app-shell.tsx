import { useEffect, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";

import styles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

const bannerImageSrc = "/images/country-ranking-banner-v5.png";

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
    <div className="min-h-screen">
      <header
        className="border-b-2 border-border bg-secondary-background"
        aria-label="Site header"
      >
        <div className="relative overflow-hidden border-b-2 border-border bg-background">
          <img
            className="block aspect-[16/5] w-full object-cover max-md:min-h-36"
            src={bannerImageSrc}
            alt="The Internet Judges Earth"
          />
          <p className={styles.bannerTagline} aria-label="Banner tagline">
            {bannerTagline}
          </p>
        </div>
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 max-md:flex-col max-md:items-stretch sm:px-6 lg:px-8">
          <a
            className="inline-flex min-w-max text-base font-heading text-inherit no-underline max-md:min-w-0 max-md:justify-center max-md:text-center"
            href="/"
          >
            Country Ranking
          </a>
          <nav
            className="flex flex-1 flex-wrap items-center justify-end gap-2 max-md:justify-stretch"
            aria-label="Primary navigation"
          >
            {navigationLinks.map((link) => (
              <Button
                asChild
                className="min-h-9 min-w-28 px-3 max-md:min-w-0 max-md:flex-1 max-md:basis-36"
                key={link.href}
                variant="neutral"
              >
                <a href={link.href}>{link.label}</a>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </div>
  );
}
