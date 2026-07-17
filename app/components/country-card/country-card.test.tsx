import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
      <CountryCard country={country} />,
    );

    expect(html).toContain("Japan");
    expect(html).toContain("Capital:");
    expect(html).toContain("Tokyo");
    expect(html).toContain(
      "Vending machines, bullet trains, and stationery with main-character energy.",
    );
    expect(html).toContain("Japan flag");
    expect(html).toContain("1,234 likes");
    expect(html).toContain("56 dislikes");
    expect(html).toContain(
      "Japan vote ratio: 1,234 likes (96%) and 56 dislikes (4%).",
    );
    expect(html).toContain("Like Japan");
    expect(html).toContain("Dislike Japan");
    expect(html).toContain(">Like</button>");
    expect(html).toContain(">Dislike</button>");
    expect(html).toContain("bg-vote-like");
    expect(html).toContain("bg-vote-dislike");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="95.');
    expect(html).toContain("transform:translateX(-4.");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<dt");
    expect(html).not.toContain("<dd");
  });

  it("renders an even empty chart with accessible zero totals", () => {
    const html = renderToString(
      <CountryCard country={{ ...country, likes: 0, dislikes: 0 }} />,
    );

    expect(html).toContain("0 likes");
    expect(html).toContain("0 dislikes");
    expect(html).toContain(
      "Japan vote ratio: 0 likes (0%) and 0 dislikes (0%).",
    );
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("transform:translateX(-50%)");
  });
});
