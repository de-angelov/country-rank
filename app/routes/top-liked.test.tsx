import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getTopLikedCountries, TopLikedContent } from "./top-liked";

describe("TopLiked", () => {
  it("sorts countries by likes descending", () => {
    const countries = getTopLikedCountries();

    expect(countries.map((country) => country.name).slice(0, 3)).toEqual([
      "Japan",
      "United States",
      "India",
    ]);
    expect(countries.every((country, index) => {
      const nextCountry = countries.at(index + 1);

      return nextCountry === undefined || country.likes >= nextCountry.likes;
    })).toBe(true);
  });

  it("renders ranked country cards", () => {
    const html = renderToString(<TopLikedContent />);

    expect(html).toContain("Top Liked Countries");
    expect(html).toContain('aria-label="Countries ranked by likes"');
    expect(html).toContain("Japan");
    expect(html).toContain("917");
    expect(html).toContain("Like Japan");
    expect(html.indexOf("Japan")).toBeLessThan(html.indexOf("United States"));
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("India"));
  });
});
