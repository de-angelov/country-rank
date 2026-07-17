import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { AppShell, bannerTaglines, selectBannerTagline } from "./app-shell";

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
      /<a class="[^"]*border-2[^"]*bg-main[^"]*font-heading[^"]*shadow-shadow[^"]*" href="\/">country-rank\.online<\/a>/,
    );
    expect(html).toContain(selectBannerTagline("/"));
    expect(html).toContain('href="/"');
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
    expect(renderAppShell("/")).toMatch(
      new RegExp(`aria-label="Banner tagline">${homeTagline}</p>`),
    );
    expect(renderAppShell("/top-liked")).toMatch(
      new RegExp(`aria-label="Banner tagline">${likedTagline}</p>`),
    );
    expect(renderAppShell("/top-disliked")).toMatch(
      new RegExp(`aria-label="Banner tagline">${dislikedTagline}</p>`),
    );
  });

  it("keeps the same banner tagline for repeated renders of one pathname", () => {
    const firstRender = renderAppShell("/top-liked");
    const nextRender = renderAppShell("/top-liked");
    const tagline = selectBannerTagline("/top-liked");

    expect(firstRender).toMatch(
      new RegExp(`aria-label="Banner tagline">${tagline}</p>`),
    );
    expect(nextRender).toMatch(
      new RegExp(`aria-label="Banner tagline">${tagline}</p>`),
    );
    expect(firstRender).toBe(nextRender);
  });
});
