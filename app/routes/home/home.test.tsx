import { renderToString } from "react-dom/server";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it } from "vitest";

import type { Country } from "~/countries";

import { filterCountriesByName, HomeCountriesContent } from "./home";
import { loadHomeCountries } from "./home.server";
import {
  clearPaidVoteRedirectQueryState,
  getPaidVoteRedirectQueryState,
} from "./paid-vote-redirect-query";
import { mapPaidVoteStatusResponseToHomeState } from "./paid-vote-confirmation-state";

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");

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
    code: "GB",
    name: "United Kingdom",
    capital: "London",
    factSnippet: "Test snippet for the United Kingdom.",
    flagImageUrl: "https://example.com/gb.svg",
    likes: 18,
    dislikes: 5,
  },
] as const satisfies readonly Country[];

describe("Home", () => {
  it("loads Redis-backed countries for the route", async () => {
    await expect(loadHomeCountries(() => okAsync(countries))).resolves.toBe(
      countries,
    );
  });

  it("returns a server error response when Redis totals fail to load", async () => {
    const error = {
      code: "missing_redis_config" as const,
      message: "REDIS_URL must be set to read or write vote totals.",
      envVar: "REDIS_URL" as const,
    };
    let thrownResponse: unknown;

    try {
      await loadHomeCountries(() => errAsync(error));
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

  it("renders a searchable list of loaded countries with Redis-backed totals", () => {
    const html = renderToString(<HomeCountriesContent countries={countries} />);

    expect(html).toContain("Countries");
    expect(html).toContain('type="search"');
    expect(html).toContain('id="country-search"');
    expect(html).toContain("Search countries");
    expect(html).toContain("country-filter-transition");
    expect(html).toContain('id="country-search"');
    expect(visibleText(html)).not.toContain("Showing");

    for (const country of countries) {
      expect(html).toContain(country.name);
      expect(html).toContain(`${country.name} flag`);
      expect(html).toContain(String(country.likes));
      expect(html).toContain(String(country.dislikes));
    }
  });

  it("renders the filtered country cards from an initial search value", () => {
    const html = renderToString(
      <HomeCountriesContent countries={countries} initialSearch="jap" />,
    );

    expect(html).toContain('value="jap"');
    expect(visibleText(html)).not.toContain("Showing");
    expect(html).toContain("Japan");
    expect(html).not.toContain("United States");
    expect(html).not.toContain("United Kingdom");
  });

  it("renders the no-match state for an initial search with no results", () => {
    const html = renderToString(
      <HomeCountriesContent countries={countries} initialSearch="zzzz" />,
    );
    const text = visibleText(html);

    expect(html).toContain('value="zzzz"');
    expect(text).not.toContain("Showing");
    expect(html).toContain("No countries match that search.");

    for (const country of countries) {
      expect(html).not.toContain(country.name);
    }
  });

  it("filters, changes, and clears country search results by name", () => {
    expect(filterCountriesByName(countries, "jap").map(({ name }) => name))
      .toEqual(["Japan"]);

    expect(filterCountriesByName(countries, "uni").map(({ name }) => name))
      .toEqual(["United States", "United Kingdom"]);

    expect(filterCountriesByName(countries, "king").map(({ name }) => name))
      .toEqual(["United Kingdom"]);

    expect(filterCountriesByName(countries, "").map(({ name }) => name))
      .toEqual(["Japan", "United States", "United Kingdom"]);
  });

  it("filters countries by partial name without matching other fields", () => {
    expect(filterCountriesByName(countries, "uni").map(({ name }) => name))
      .toEqual(["United States", "United Kingdom"]);

    expect(filterCountriesByName(countries, "tokyo")).toEqual([]);
    expect(filterCountriesByName(countries, "   ")).toBe(countries);
  });

  it("recognizes successful paid vote redirect query state", () => {
    expect(
      getPaidVoteRedirectQueryState(
        "https://country-ranking.test/?session_id=cs_test_paid_vote_123",
      ),
    ).toEqual({
      status: "present",
      sessionId: "cs_test_paid_vote_123",
    });
  });

  it("returns absent paid vote redirect query state without a session id", () => {
    expect(
      getPaidVoteRedirectQueryState("https://country-ranking.test/?q=japan"),
    ).toEqual({
      status: "absent",
    });
  });

  it("returns absent paid vote redirect query state for malformed session ids", () => {
    expect(
      getPaidVoteRedirectQueryState(
        "https://country-ranking.test/?session_id=pi_test_bad",
      ),
    ).toEqual({
      status: "absent",
    });
    expect(
      getPaidVoteRedirectQueryState(
        "https://country-ranking.test/?session_id=%20%20%20",
      ),
    ).toEqual({
      status: "absent",
    });
  });

  it("clears checkout query state without dropping unrelated URL state", () => {
    expect(
      clearPaidVoteRedirectQueryState(
        "/?sort=liked&session_id=cs_test_paid_vote_123&filter=asia#countries",
      ),
    ).toBe("/?sort=liked&filter=asia#countries");

    expect(
      clearPaidVoteRedirectQueryState(
        "https://country-ranking.test/?session_id=bad&q=Japan",
      ),
    ).toBe("https://country-ranking.test/?q=Japan");
  });

  it("maps applied paid vote status to applied home confirmation state", () => {
    expect(
      mapPaidVoteStatusResponseToHomeState({
        ok: true,
        data: {
          status: "applied",
          countryCode: "JP",
          voteType: "like",
          totals: {
            countryCode: "JP",
            likes: 13,
            dislikes: 4,
          },
        },
      }),
    ).toEqual({
      status: "applied",
      countryCode: "JP",
      voteType: "like",
      totals: {
        countryCode: "JP",
        likes: 13,
        dislikes: 4,
      },
    });
  });

  it("maps pending paid vote status without claiming the vote was applied", () => {
    expect(
      mapPaidVoteStatusResponseToHomeState({
        ok: true,
        data: {
          status: "pending",
        },
      }),
    ).toEqual({
      status: "pending",
    });
  });

  it("maps invalid paid vote status responses to invalid home confirmation state", () => {
    expect(
      mapPaidVoteStatusResponseToHomeState({
        ok: false,
        error: {
          code: "invalid_checkout_status_request",
          message: "Checkout status request is invalid.",
          fieldErrors: {
            session_id: "session_id must be a valid Stripe Checkout Session ID.",
          },
        },
      }),
    ).toEqual({
      status: "invalid",
      message: "Checkout status request is invalid.",
    });

    expect(
      mapPaidVoteStatusResponseToHomeState({
        ok: true,
        data: {
          status: "not_found",
        },
      }),
    ).toEqual({
      status: "invalid",
      message: "We could not confirm that paid vote session.",
    });
  });

  it("maps failed paid vote status lookup responses to lookup failure state", () => {
    expect(
      mapPaidVoteStatusResponseToHomeState({
        ok: false,
        error: {
          code: "redis_command_failed",
          message: "Failed to read paid vote fulfillment record from Redis.",
        },
      }),
    ).toEqual({
      status: "lookup_failed",
      message: "Failed to read paid vote fulfillment record from Redis.",
    });
  });
});
