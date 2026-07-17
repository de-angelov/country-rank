import { useContext, type ReactNode } from "react";
import { UNSAFE_LocationContext } from "react-router";

import { Button } from "~/components/ui/button";

import moduleStyles from "./app-shell.module.css";

const navigationLinks = [
  { href: "/", label: "Countries" },
  { href: "/top-liked", label: "Top Liked" },
  { href: "/top-disliked", label: "Top Disliked" },
] as const;

const bannerImage = {
  alt: "The Internet Judges Earth",
  height: 809,
  sizes: "(max-width: 640px) 100vw, (max-width: 1200px) 1600px, 1994px",
  sources: {
    avif: [
      "/images/banner/country-ranking-banner-v7-960.avif 960w",
      "/images/banner/country-ranking-banner-v7-1600.avif 1600w",
      "/images/banner/country-ranking-banner-v7-2400.avif 2400w",
    ].join(", "),
    webp: [
      "/images/banner/country-ranking-banner-v7-960.webp 960w",
      "/images/banner/country-ranking-banner-v7-1600.webp 1600w",
      "/images/banner/country-ranking-banner-v7-2400.webp 2400w",
    ].join(", "),
    png: [
      "/images/banner/country-ranking-banner-v7-960.png 960w",
      "/images/banner/country-ranking-banner-v7-1600.png 1600w",
      "/images/banner/country-ranking-banner-v7-2400.png 2400w",
    ].join(", "),
  },
  src: "/images/banner/country-ranking-banner-v7-1600.png",
  width: 4800,
} as const;

const styles = {
  root: "relative z-10 min-h-screen",
  header: "border-b-2 border-border bg-secondary-background",
  bannerFrame: "relative overflow-hidden border-b-2 border-border bg-background",
  bannerImage: "mx-auto block h-full max-h-full w-auto max-w-full object-contain",
  ribbon:
    "mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 max-md:flex-col max-md:items-stretch max-md:gap-2 sm:px-6 lg:px-8",
  brandLink:
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-base border-2 border-border bg-main px-2.5 py-1 text-sm font-heading leading-none text-main-foreground no-underline shadow-shadow max-md:w-full max-md:min-w-0 max-md:text-center sm:text-base",
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

export function selectBannerTagline(pathname: string) {
  let hash = 0;

  for (const character of pathname || "/") {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return bannerTaglines[hash % bannerTaglines.length];
}

export function AppShell({ children }: { children: ReactNode }) {
  const locationContext = useContext(UNSAFE_LocationContext);
  const bannerTagline = selectBannerTagline(
    locationContext?.location.pathname ?? "/",
  );

  return (
    <div className={styles.root}>
      <header
        className={styles.header}
        aria-label="Site header"
      >
        <div className={`${styles.bannerFrame} ${moduleStyles.bannerFrame}`}>
          <picture>
            <source
              type="image/avif"
              srcSet={bannerImage.sources.avif}
              sizes={bannerImage.sizes}
            />
            <source
              type="image/webp"
              srcSet={bannerImage.sources.webp}
              sizes={bannerImage.sizes}
            />
            <img
              className={moduleStyles.bannerImage}
              src={bannerImage.src}
              srcSet={bannerImage.sources.png}
              sizes={bannerImage.sizes}
              width={bannerImage.width}
              height={bannerImage.height}
              alt={bannerImage.alt}
            />
          </picture>

          <p className={moduleStyles.bannerTagline} aria-label="Banner tagline">
            {bannerTagline}
          </p>
        </div>
        <div className={styles.ribbon}>
          <a
            className={styles.brandLink}
            href="/"
          >
            country-rank.online
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
