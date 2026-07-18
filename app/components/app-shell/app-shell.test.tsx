import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import {
  AppShell,
  bannerTaglines,
  createBannerTaglineState,
  selectBannerTagline,
  selectDifferentBannerTagline,
  shuffleBannerTaglineState,
  syncBannerTaglineToPathname,
} from "./app-shell";

const renderAppShell = (pathname = "/") =>
  renderToString(
    <MemoryRouter initialEntries={[pathname]}>
      <AppShell>
        <main>Page content</main>
      </AppShell>
    </MemoryRouter>,
  );

describe("AppShell", () => {
  it("renders a full-width banner above compact ribbon navigation", () => {
    const html = renderAppShell("/");

    const bannerIndex = html.indexOf(
      'src="/images/banner/country-ranking-banner-v7-1600.png"',
    );
    const navIndex = html.indexOf('aria-label="Primary navigation"');

    expect(bannerIndex).toBeGreaterThan(-1);
    expect(navIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(navIndex);
    expect(html).toContain('type="image/avif"');
    expect(html).toContain(
      'srcSet="/images/banner/country-ranking-banner-v7-960.avif 960w, /images/banner/country-ranking-banner-v7-1600.avif 1600w, /images/banner/country-ranking-banner-v7-2400.avif 2400w"',
    );
    expect(html).toContain('type="image/webp"');
    expect(html).toContain(
      'srcSet="/images/banner/country-ranking-banner-v7-960.webp 960w, /images/banner/country-ranking-banner-v7-1600.webp 1600w, /images/banner/country-ranking-banner-v7-2400.webp 2400w"',
    );
    expect(html).toContain(
      'srcSet="/images/banner/country-ranking-banner-v7-960.png 960w, /images/banner/country-ranking-banner-v7-1600.png 1600w, /images/banner/country-ranking-banner-v7-2400.png 2400w"',
    );
    expect(html).toContain(
      'sizes="(max-width: 640px) 100vw, (max-width: 1200px) 1600px, 1994px"',
    );
    expect(html).toContain('width="4800"');
    expect(html).toContain('height="809"');
    expect(html).toContain('alt="The Internet Judges Earth"');
    expect(html).toContain('aria-label="Banner tagline"');
    expect(html).toMatch(
      /<button data-slot="button" class="(?=[^"]*border-2)(?=[^"]*bg-accent-highlight)(?=[^"]*font-heading)(?=[^"]*shadow-shadow)[^"]*" type="button">country-rank\.online<\/button>/,
    );
    expect(html).toContain(selectBannerTagline("/"));
    expect(html).toMatch(/<a href="\/"[^>]*>Countries<\/a>/);
    expect(html).not.toMatch(/<a[^>]*>country-rank\.online<\/a>/);
    expect(html).toContain("Countries");
    expect(html).toContain('href="/top-liked"');
    expect(html).toContain("Top Liked");
    expect(html).toContain('href="/top-disliked"');
    expect(html).toContain("Top Disliked");
    expect(html).not.toContain('aria-label="Reserved meme media placeholder"');
    expect(html).not.toContain("Meme media placeholder");
    expect(html).toContain("Page content");
  });

  it("keeps banner tagline options in one editable list", () => {
    expect(bannerTaglines).toEqual([
      "Rankings Without Borders",
      "Global Rankings. Local Beef.",
      "The Internet Judges Earth.",
      "Diplomacy Not Included.",
      "No Chill. Just Rankings.",
      "Earth, Reviewed.",
      "Petty by Popular Vote.",
    ]);
  });

  it("selects multiple stable banner taglines from route pathnames", () => {
    const homeTagline = selectBannerTagline("/");
    const likedTagline = selectBannerTagline("/top-liked");
    const dislikedTagline = selectBannerTagline("/top-disliked");

    expect(new Set([homeTagline, likedTagline, dislikedTagline]).size).toBe(3);
    expect(renderAppShell("/")).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${homeTagline}</p>`,
    );
    expect(renderAppShell("/top-liked")).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${likedTagline}</p>`,
    );
    expect(renderAppShell("/top-disliked")).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${dislikedTagline}</p>`,
    );
  });

  it("keeps the same banner tagline for repeated renders of one pathname", () => {
    const firstRender = renderAppShell("/top-liked");
    const nextRender = renderAppShell("/top-liked");
    const tagline = selectBannerTagline("/top-liked");

    expect(firstRender).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${tagline}</p>`,
    );
    expect(nextRender).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${tagline}</p>`,
    );
    expect(firstRender).toBe(nextRender);
  });

  it("renders the deterministic initial tagline without a random shuffle", () => {
    const pathname = "/top-disliked";
    const html = renderAppShell(pathname);

    expect(html).toContain(
      `aria-label="Banner tagline" data-animation-replay-key="0">${selectBannerTagline(pathname)}</p>`,
    );
    expect(html).toMatch(
      /<button data-slot="button" class="(?=[^"]*bg-accent-highlight)[^"]*" type="button">country-rank\.online<\/button>/,
    );
  });

  it("selects a different random banner tagline when alternatives exist", () => {
    for (const currentTagline of bannerTaglines) {
      const nextTagline = selectDifferentBannerTagline(currentTagline, () => 0);

      expect(bannerTaglines).toContain(nextTagline);
      expect(nextTagline).not.toBe(currentTagline);
    }
  });

  it("uses the supplied random value to keep repeated shuffles variable", () => {
    const currentTagline = bannerTaglines[0];

    expect(selectDifferentBannerTagline(currentTagline, () => 0)).toBe(
      bannerTaglines[1],
    );
    expect(selectDifferentBannerTagline(currentTagline, () => 0.99)).toBe(
      bannerTaglines[bannerTaglines.length - 1],
    );
    expect(selectDifferentBannerTagline(currentTagline, () => 1)).toBe(
      bannerTaglines[bannerTaglines.length - 1],
    );
  });

  it("starts the banner tagline animation replay key at zero", () => {
    expect(createBannerTaglineState("/top-liked")).toEqual({
      animationReplayKey: 0,
      tagline: selectBannerTagline("/top-liked"),
    });
    expect(renderAppShell("/top-liked")).toContain(
      'aria-label="Banner tagline" data-animation-replay-key="0"',
    );
  });

  it("increments the animation replay key only after a successful shuffle", () => {
    const initialState = createBannerTaglineState("/");
    const shuffledState = shuffleBannerTaglineState(initialState, () => 0);
    const nextShuffledState = shuffleBannerTaglineState(
      shuffledState,
      () => 0.99,
    );

    expect(shuffledState.animationReplayKey).toBe(1);
    expect(shuffledState.tagline).not.toBe(initialState.tagline);
    expect(nextShuffledState.animationReplayKey).toBe(2);
    expect(nextShuffledState.tagline).not.toBe(shuffledState.tagline);
  });

  it("syncs pathname taglines without replaying the shuffle animation", () => {
    const shuffledState = shuffleBannerTaglineState(
      createBannerTaglineState("/"),
      () => 0,
    );
    const routeSyncedState = syncBannerTaglineToPathname(
      shuffledState,
      "/top-liked",
    );

    expect(routeSyncedState).toEqual({
      animationReplayKey: shuffledState.animationReplayKey,
      tagline: selectBannerTagline("/top-liked"),
    });
  });
});
