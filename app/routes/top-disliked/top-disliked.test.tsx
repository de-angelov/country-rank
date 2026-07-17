import { renderToString } from "react-dom/server";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it } from "vitest";

import { orderRankedCountries } from "~/components/ranking-order-control/ranking-order-control";
import type { Country } from "~/countries";

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

const expectNamesInHtmlOrder = (html: string, names: readonly string[]) => {
  const nameIndexes = names.map((name) => html.indexOf(name));

  expect(nameIndexes).not.toContain(-1);

  for (let index = 1; index < nameIndexes.length; index += 1) {
    expect(nameIndexes[index]).toBeGreaterThan(nameIndexes[index - 1]);
  }
};

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
    expect(html).toContain("Highest dislikes first");
    expect(html).toContain("Lowest dislikes first");
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
    expect(html.indexOf('aria-label="Rank 2"')).toBeLessThan(
      html.indexOf("United States"),
    );
    expect(html.indexOf('aria-label="Rank 3"')).toBeLessThan(
      html.indexOf("Japan"),
    );
    expectNamesInHtmlOrder(html, ["India", "United States", "Japan"]);
  });

  it("orders ranked countries highest-first by default and lowest-first when reversed", () => {
    const rankedCountries = getTopDislikedCountries(countries);

    expect(
      orderRankedCountries(rankedCountries, "highest-first").map(
        (country) => country.name,
      ),
    ).toEqual(["India", "United States", "Japan"]);
    expect(
      orderRankedCountries(rankedCountries, "lowest-first").map(
        (country) => country.name,
      ),
    ).toEqual(["Japan", "United States", "India"]);
  });
});
