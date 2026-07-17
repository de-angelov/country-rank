import { renderToString } from "react-dom/server";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it } from "vitest";

import type { Country } from "~/countries";
import { orderRankedCountries } from "~/components/ranking-order-controls/ranking-order-controls";

import {
  getTopLikedCountries,
  loadTopLikedCountries,
} from "./top-liked.server";
import { TopLikedContent } from "./top-liked";

const countries = [
  {
    code: "JP",
    name: "Japan",
    capital: "Tokyo",
    factSnippet: "Test snippet for Japan.",
    flagImageUrl: "https://example.com/jp.svg",
    likes: 12,
    dislikes: 4,
  },
  {
    code: "US",
    name: "United States",
    capital: "Washington, D.C.",
    factSnippet: "Test snippet for the United States.",
    flagImageUrl: "https://example.com/us.svg",
    likes: 25,
    dislikes: 6,
  },
  {
    code: "IN",
    name: "India",
    capital: "New Delhi",
    factSnippet: "Test snippet for India.",
    flagImageUrl: "https://example.com/in.svg",
    likes: 18,
    dislikes: 5,
  },
] as const satisfies readonly Country[];

describe("TopLiked", () => {
  it("sorts loaded countries by Redis-backed likes descending", async () => {
    const rankedCountries = await loadTopLikedCountries(() => okAsync(countries));

    expect(rankedCountries.map((country) => country.name)).toEqual([
      "United States",
      "India",
      "Japan",
    ]);
    expect(rankedCountries.every((country, index) => {
      const nextCountry = rankedCountries.at(index + 1);

      return nextCountry === undefined || country.likes >= nextCountry.likes;
    })).toBe(true);
  });

  it("returns a server error response when Redis totals fail to load", async () => {
    const error = {
      code: "missing_redis_config" as const,
      message: "REDIS_URL must be set to read or write vote totals.",
      envVar: "REDIS_URL" as const,
    };
    let thrownResponse: unknown;

    try {
      await loadTopLikedCountries(() => errAsync(error));
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
    const rankedCountries = getTopLikedCountries(countries);
    const html = renderToString(
      <TopLikedContent countries={rankedCountries} />,
    );

    expect(html).toContain("Top Liked Countries");
    expect(html).toContain(
      "md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end",
    );
    expect(html).toContain("Ranking order");
    expect(html).toContain(
      'aria-label="Highest likes first" aria-pressed="true"',
    );
    expect(html).toContain('title="Highest likes first"');
    expect(html).toContain(
      'aria-label="Lowest likes first" aria-pressed="false"',
    );
    expect(html).toContain('title="Lowest likes first"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Countries ranked by likes"');
    expect(html).toContain("United States");
    expect(html).toContain("25");
    expect(html).toContain("Like United States");
    expect(html).toContain("bg-vote-like");
    expect(html).not.toContain("Rank 1</");
    expect(html.indexOf('aria-label="Rank 1"')).toBeLessThan(
      html.indexOf("United States"),
    );
    expect(html.indexOf('aria-label="Rank 2"')).toBeLessThan(
      html.indexOf("India"),
    );
    expect(html.indexOf('aria-label="Rank 3"')).toBeLessThan(
      html.indexOf("Japan"),
    );
    expect(html.indexOf("United States")).toBeLessThan(html.indexOf("India"));
    expect(html.indexOf("India")).toBeLessThan(html.indexOf("Japan"));
    expect(html.indexOf("Countries ordered by the highest like counts."))
      .toBeLessThan(html.indexOf("Ranking order"));
    expect(html.indexOf("Ranking order")).toBeLessThan(
      html.indexOf('aria-label="Countries ranked by likes"'),
    );
  });

  it("orders ranked countries highest first by default and lowest first on request", () => {
    const rankedCountries = getTopLikedCountries(countries);

    expect(
      orderRankedCountries(rankedCountries, "highest-first").map(
        ({ name }) => name,
      ),
    ).toEqual(["United States", "India", "Japan"]);
    expect(
      orderRankedCountries(rankedCountries, "lowest-first").map(
        ({ name }) => name,
      ),
    ).toEqual(["Japan", "India", "United States"]);
  });
});
