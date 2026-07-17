import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell, bannerTagline, bannerTaglines } from "./app-shell";

describe("AppShell", () => {
  it("renders a full-width banner above compact ribbon navigation", () => {
    const html = renderToString(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const bannerIndex = html.indexOf(
      'src="/images/country-ranking-banner-v7.png"',
    );
    const navIndex = html.indexOf('aria-label="Primary navigation"');

    expect(bannerIndex).toBeGreaterThan(-1);
    expect(navIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(navIndex);
    expect(html).toContain('alt="The Internet Judges Earth"');
    expect(html).toContain('aria-label="Banner tagline"');
    expect(html).toContain("Country Ranking");
    expect(html).toContain("Rankings Without Borders");
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

  it("uses a deterministic banner tagline for server and client renders", () => {
    const firstRender = renderToString(
      <AppShell>
        <main>First page</main>
      </AppShell>,
    );
    const nextRender = renderToString(
      <AppShell>
        <main>Next page</main>
      </AppShell>,
    );

    expect(bannerTagline).toBe("Rankings Without Borders");
    expect(firstRender).toMatch(
      /aria-label="Banner tagline">Rankings Without Borders<\/p>/,
    );
    expect(nextRender).toMatch(
      /aria-label="Banner tagline">Rankings Without Borders<\/p>/,
    );

    for (const alternateTagline of bannerTaglines.slice(1)) {
      expect(firstRender).not.toContain(alternateTagline);
      expect(nextRender).not.toContain(alternateTagline);
    }
  });
});
