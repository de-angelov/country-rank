import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getTopDislikedCountries, TopDislikedContent } from "./top-disliked";

describe("TopDisliked", () => {
  it("sorts countries by dislikes descending", () => {
    const countries = getTopDislikedCountries();

    expect(countries.map((country) => country.name).slice(0, 3)).toEqual([
      "United States",
      "France",
      "India",
    ]);
    expect(
      countries.every((country, index) => {
        const nextCountry = countries.at(index + 1);

        return (
          nextCountry === undefined || country.dislikes >= nextCountry.dislikes
        );
      }),
    ).toBe(true);
  });

  it("renders ranked country cards", () => {
    const html = renderToString(<TopDislikedContent />);

    expect(html).toContain("Top Disliked Countries");
    expect(html).toContain('aria-label="Countries ranked by dislikes"');
    expect(html).toContain("United States");
    expect(html).toContain("318");
    expect(html).toContain("Dislike United States");
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("France"));
    expect(html.indexOf("France")).toBeLessThan(html.indexOf("India"));
  });
});
