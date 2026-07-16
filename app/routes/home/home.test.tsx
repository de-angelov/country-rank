import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { countryFixtures } from "~/countries";

import { filterCountriesByName, HomeContent } from "./home";

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");

describe("Home", () => {
  it("renders a searchable list of all fixture countries", () => {
    const html = renderToString(<HomeContent />);
    const text = visibleText(html);

    expect(html).toContain("Countries");
    expect(html).toContain('type="search"');
    expect(html).toContain('id="country-search"');
    expect(html).toContain("Search countries");
    expect(text).toContain(`Showing ${countryFixtures.length} countries`);

    for (const country of countryFixtures) {
      expect(html).toContain(country.name);
      expect(html).toContain(`${country.name} flag`);
    }
  });

  it("renders the filtered country cards from an initial search value", () => {
    const html = renderToString(<HomeContent initialSearch="jap" />);
    const text = visibleText(html);

    expect(html).toContain('value="jap"');
    expect(text).toContain("Showing 1 country");
    expect(html).toContain("Japan");
    expect(html).not.toContain("Canada");
  });

  it("filters countries by partial name without matching other fields", () => {
    expect(filterCountriesByName(countryFixtures, "uni").map(({ name }) => name))
      .toEqual(["United States", "United Kingdom"]);

    expect(filterCountriesByName(countryFixtures, "tokyo")).toEqual([]);
    expect(filterCountriesByName(countryFixtures, "   ")).toBe(countryFixtures);
  });
});
