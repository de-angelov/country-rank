import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders a full-width banner above compact ribbon navigation", () => {
    const html = renderToString(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    const bannerIndex = html.indexOf(
      'src="/images/country-ranking-banner-placeholder.svg"',
    );
    const navIndex = html.indexOf('aria-label="Primary navigation"');

    expect(bannerIndex).toBeGreaterThan(-1);
    expect(navIndex).toBeGreaterThan(-1);
    expect(bannerIndex).toBeLessThan(navIndex);
    expect(html).toContain('alt="The Internet Judges Earth"');
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
});
