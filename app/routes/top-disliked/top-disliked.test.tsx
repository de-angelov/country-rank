import { renderToString } from "react-dom/server";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it } from "vitest";

import type { Country } from "~/countries";
import {
  getDisplayedRankNumber,
  RankedCountriesList,
} from "~/components/ranked-countries-list/ranked-countries-list";
import { orderRankedCountries } from "~/components/ranking-order-controls/ranking-order-controls";

import {
  getTopDislikedCountries,
  loadTopDislikedCountries,
} from "./top-disliked.server";
import { TopDislikedContent } from "./top-disliked";

const countries = [
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    factSnippet: "Test snippet for Japan.",
    flagImageUrl: "https://example.com/jp.svg",
    likes: 12,
    dislikes: 18,
  },
  {
    code: "US",
    name: "United States",
    capital: "Washington, D.C.",
    factSnippet: "Test snippet for the United States.",
    flagImageUrl: "https://example.com/us.svg",
    likes: 25,
    dislikes: 31,
  },
  {
    code: "IN",
    name: "India",
    capital: "New Delhi",
    factSnippet: "Test snippet for India.",
    flagImageUrl: "https://example.com/in.svg",
    likes: 18,
    dislikes: 44,
  },
] as const satisfies readonly Country[];

describe("TopDisliked", () => {
  it("sorts loaded countries by Redis-backed dislikes descending", async () => {
    const rankedCountries = await loadTopDislikedCountries(() =>
      okAsync(countries),
    );

    expect(rankedCountries.map((country) => country.name)).toEqual([
      "India",
      "United States",
      "Japan",
    ]);
    expect(
      rankedCountries.every((country, index) => {
        const nextCountry = rankedCountries.at(index + 1);

        return (
          nextCountry === undefined || country.dislikes >= nextCountry.dislikes
        );
      }),
    ).toBe(true);
  });

  it("returns a server error response when Redis totals fail to load", async () => {
    const error = {
      code: "redis_command_failed" as const,
      message: "Failed to read country vote totals from Redis.",
      cause: new Error("read failed"),
    };
    let thrownResponse: unknown;

    try {
      await loadTopDislikedCountries(() => errAsync(error));
    } catch (response) {
      thrownResponse = response;
    }

    expect(thrownResponse).toBeInstanceOf(Response);

    const serverErrorResponse = thrownResponse as Response;

    expect(serverErrorResponse.status).toBe(500);
    expect(serverErrorResponse.statusText).toBe(
      "Failed to load country rankings.",
    );
    await expect(serverErrorResponse.text()).resolves.toBe(error.message);
  });

  it("renders ranked country cards", () => {
    const rankedCountries = getTopDislikedCountries(countries);
    const html = renderToString(
      <TopDislikedContent countries={rankedCountries} />,
    );

    expect(html).toContain("Top Disliked Countries");
    expect(html).toContain(
      "md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end",
    );
    expect(html).toContain("Ranking order");
    expect(html).toContain(
      'aria-label="Highest dislikes first" aria-pressed="true"',
    );
    expect(html).toContain('title="Highest dislikes first"');
    expect(html).toContain(
      'aria-label="Lowest dislikes first" aria-pressed="false"',
    );
    expect(html).toContain('title="Lowest dislikes first"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Countries ranked by dislikes"');
    expect(html).toContain("India");
    expect(html).toContain("44");
    expect(html).toContain("Dislike India");
    expect(html).toContain("bg-vote-dislike");
    expect(html).not.toContain("Rank 1</");
    expect(html.indexOf('aria-label="Rank 1"')).toBeLessThan(
      html.indexOf("India"),
    );
    expect(html).toContain('aria-label="Rank 1">1</div>');
    expect(html.indexOf('aria-label="Rank 2"')).toBeLessThan(
      html.indexOf("United States"),
    );
    expect(html).toContain('aria-label="Rank 2">2</div>');
    expect(html.indexOf('aria-label="Rank 3"')).toBeLessThan(
      html.indexOf("Japan"),
    );
    expect(html).toContain('aria-label="Rank 3">3</div>');
    expect(html.indexOf("India")).toBeLessThan(html.indexOf("United States"));
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("Japan"));
    expect(html.indexOf("Countries ordered by the highest dislike counts."))
      .toBeLessThan(html.indexOf("Ranking order"));
    expect(html.indexOf("Ranking order")).toBeLessThan(
      html.indexOf('aria-label="Countries ranked by dislikes"'),
    );
  });

  it("orders ranked countries highest first by default and lowest first on request", () => {
    const rankedCountries = getTopDislikedCountries(countries);

    expect(
      orderRankedCountries(rankedCountries, "highest-first").map(
        ({ name }) => name,
      ),
    ).toEqual(["India", "United States", "Japan"]);
    expect(
      orderRankedCountries(rankedCountries, "lowest-first").map(
        ({ name }) => name,
      ),
    ).toEqual(["Japan", "United States", "India"]);
  });

  it("displays highest-first rank numbers from 1 and lowest-first rank numbers from the total", () => {
    const rankedCountries = getTopDislikedCountries(countries);

    expect(
      orderRankedCountries(rankedCountries, "highest-first").map(
        (_country, index, orderedCountries) =>
          getDisplayedRankNumber({
            index,
            order: "highest-first",
            total: orderedCountries.length,
          }),
      ),
    ).toEqual([1, 2, 3]);
    expect(
      orderRankedCountries(rankedCountries, "lowest-first").map(
        (_country, index, orderedCountries) =>
          getDisplayedRankNumber({
            index,
            order: "lowest-first",
            total: orderedCountries.length,
          }),
      ),
    ).toEqual([3, 2, 1]);
  });

  it("renders lowest-first disliked ranks with visible numbers matching aria labels", () => {
    const rankedCountries = getTopDislikedCountries(countries);
    const orderedCountries = orderRankedCountries(
      rankedCountries,
      "lowest-first",
    );
    const html = renderToString(
      <RankedCountriesList
        ariaLabel="Countries ranked by dislikes"
        countries={orderedCountries}
        rankNumberOrder="lowest-first"
        rankTone="dislike"
      />,
    );

    expect(html.indexOf('aria-label="Rank 3">3</div>')).toBeLessThan(
      html.indexOf("Japan"),
    );
    expect(html.indexOf('aria-label="Rank 2">2</div>')).toBeLessThan(
      html.indexOf("United States"),
    );
    expect(html.indexOf('aria-label="Rank 1">1</div>')).toBeLessThan(
      html.indexOf("India"),
    );
    expect(html.indexOf("Japan")).toBeLessThan(
      html.indexOf("United States"),
    );
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("India"));
  });
});
