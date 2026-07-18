import { useContext, useEffect, useState, type ReactNode } from "react";
import { Link, UNSAFE_LocationContext } from "react-router";

import { Button } from "~/components/ui/button";

import moduleStyles from "./app-shell.module.css";

const navigationLinks = [
  { to: "/", label: "Countries" },
  { to: "/top-liked", label: "Top Liked" },
  { to: "/top-disliked", label: "Top Disliked" },
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
  brandButton:
    "h-auto shrink-0 bg-accent-highlight px-2.5 py-1 text-sm font-heading leading-none text-foreground max-md:w-full max-md:min-w-0 max-md:text-center sm:text-base",
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

export function selectDifferentBannerTagline(
  currentTagline: string,
  random = Math.random,
) {
  const availableTaglines = bannerTaglines.filter(
    (tagline) => tagline !== currentTagline,
  );

  if (availableTaglines.length === 0) {
    return currentTagline;
  }

  const selectedIndex = Math.min(
    Math.floor(random() * availableTaglines.length),
    availableTaglines.length - 1,
  );

  return availableTaglines[selectedIndex];
}

type BannerTaglineState = {
  animationReplayKey: number;
  tagline: string;
};

export function createBannerTaglineState(pathname: string): BannerTaglineState {
  return {
    animationReplayKey: 0,
    tagline: selectBannerTagline(pathname),
  };
}

export function syncBannerTaglineToPathname(
  currentState: BannerTaglineState,
  pathname: string,
): BannerTaglineState {
  const tagline = selectBannerTagline(pathname);

  if (currentState.tagline === tagline) {
    return currentState;
  }

  return {
    animationReplayKey: currentState.animationReplayKey,
    tagline,
  };
}

export function shuffleBannerTaglineState(
  currentState: BannerTaglineState,
  random = Math.random,
): BannerTaglineState {
  const tagline = selectDifferentBannerTagline(currentState.tagline, random);

  if (currentState.tagline === tagline) {
    return currentState;
  }

  return {
    animationReplayKey: currentState.animationReplayKey + 1,
    tagline,
  };
}

export function AppShell({ children }: { children: ReactNode }) {
  const locationContext = useContext(UNSAFE_LocationContext);
  const pathname = locationContext?.location.pathname ?? "/";
  const [bannerTaglineState, setBannerTaglineState] = useState(() =>
    createBannerTaglineState(pathname),
  );

  useEffect(() => {
    setBannerTaglineState((currentState) =>
      syncBannerTaglineToPathname(currentState, pathname),
    );
  }, [pathname]);

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

          <p
            key={bannerTaglineState.animationReplayKey}
            className={moduleStyles.bannerTagline}
            aria-label="Banner tagline"
            data-animation-replay-key={bannerTaglineState.animationReplayKey}
          >
            {bannerTaglineState.tagline}
          </p>
        </div>
        <div className={styles.ribbon}>
          <Button
            className={styles.brandButton}
            onClick={() => {
              setBannerTaglineState((currentState) =>
                shuffleBannerTaglineState(currentState),
              );
            }}
            type="button"
          >
            country-rank.online
          </Button>
          <nav
            className={styles.nav}
            aria-label="Primary navigation"
          >
            {navigationLinks.map((link) => (
              <Button
                asChild
                className={styles.navButton}
                key={link.to}
                variant="neutral"
              >
                <Link to={link.to}>{link.label}</Link>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
