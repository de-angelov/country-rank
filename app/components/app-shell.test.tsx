import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders shared header navigation and a reserved media placeholder", () => {
    const html = renderToString(
      <AppShell>
        <main>Page content</main>
      </AppShell>,
    );

    expect(html).toContain("Country Ranking");
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('href="/"');
    expect(html).toContain("Countries");
    expect(html).toContain('href="/top-liked"');
    expect(html).toContain("Top Liked");
    expect(html).toContain('href="/top-disliked"');
    expect(html).toContain("Top Disliked");
    expect(html).toContain('aria-label="Reserved meme media placeholder"');
    expect(html).toContain("Meme media placeholder");
    expect(html).toContain("Page content");
  });
});
