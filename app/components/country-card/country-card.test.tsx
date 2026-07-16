import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CountryCard } from "./country-card";

const country = {
  code: "JP",
  name: "Japan",
  capital: "Tokyo",
  factSnippet: "Vending machines, bullet trains, and stationery with main-character energy.",
  flagImageUrl: "https://example.com/japan.svg",
  likes: 1234,
  dislikes: 56,
};

describe("CountryCard", () => {
  it("renders the country ranking details and vote actions", () => {
    const html = renderToString(
      <CountryCard
        country={country}
        onLikeClick={vi.fn()}
        onDislikeClick={vi.fn()}
      />,
    );

    expect(html).toContain("Japan");
    expect(html).toContain("Capital:");
    expect(html).toContain("Tokyo");
    expect(html).toContain(
      "Vending machines, bullet trains, and stationery with main-character energy.",
    );
    expect(html).toContain("Japan flag");
    expect(html).toContain("Likes");
    expect(html).toContain("1,234");
    expect(html).toContain("Dislikes");
    expect(html).toContain("56");
    expect(html).toContain("Like Japan");
    expect(html).toContain("Dislike Japan");
    expect(html).toContain("bg-vote-like");
    expect(html).toContain("bg-vote-dislike");
  });
});
