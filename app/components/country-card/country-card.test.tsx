import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryCard, getCountryCardFlagImageUrl } from "./country-card";

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
    expect(html).toContain('src="/flags/JP.svg"');
    expect(html).not.toContain('src="https://example.com/japan.svg"');
    expect(html).toContain('width="320"');
    expect(html).toContain('height="240"');
    expect(html).toContain(
      'class="aspect-[4/3] min-h-24 bg-background sm:min-h-0"',
    );
    expect(html).toContain("bg-background");
    expect(html).not.toContain(
      'class="aspect-[4/3] min-h-24 overflow-hidden',
    );
    expect(html).not.toContain(
      'class="aspect-[4/3] min-h-24 rounded-base',
    );
    expect(html).not.toContain(
      'class="aspect-[4/3] min-h-24 border-2 border-border',
    );
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).toContain("p-1");
    expect(html).toContain("drop-shadow(2px_0_0_var(--border))");
    expect(html).toContain("drop-shadow(2px_2px_0_var(--border))");
    expect(html).not.toContain("drop-shadow(2px_0_0_#000)");
    expect(html).not.toContain("drop-shadow(1.5px_1.5px_0_#000)");
    expect(html).not.toContain("/flags/outlined/");
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
    expect(html).toContain('id="country-card-thumbs-up"');
    expect(html).toContain('id="country-card-thumbs-down"');
    expect(html.match(/<use href="#country-card-thumbs-up"/g)).toHaveLength(2);
    expect(html.match(/<use href="#country-card-thumbs-down"/g)).toHaveLength(
      2,
    );
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(
      html.match(
        /M15 5\.88 14 10h5\.83a2 2 0 0 1 1\.92 2\.56l-2\.33 8/g,
      ),
    ).toHaveLength(1);
    expect(
      html.match(
        /M9 18\.12 10 14H4\.17a2 2 0 0 1-1\.92-2\.56l2\.33-8/g,
      ),
    ).toHaveLength(1);
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

  it("falls back to the country flag URL when no local asset exists", () => {
    expect(
      getCountryCardFlagImageUrl({
        ...country,
        code: "ZZ",
        flagImageUrl: "https://example.com/fallback.svg",
      }),
    ).toBe("https://example.com/fallback.svg");
  });
});
