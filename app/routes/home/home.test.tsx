import { renderToString } from "react-dom/server";
import { errAsync, okAsync } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "~/components/ui/dialog";
import type { Country } from "~/countries";

import {
  closePaidVoteConfirmationDialog,
  filterCountriesByName,
  getHomeRoutePaidVoteConfirmationState,
  HomeCountriesContent,
  HomeRouteContent,
  PaidVoteConfirmationDialog,
  PaidVoteConfirmationDialogContent,
  sortCountriesByDisplayName,
  toPaidVoteDialogStatus,
} from "./home";
import { loadHomeCountries, loadHomeRouteData } from "./home.server";
import {
  clearPaidVoteRedirectQueryState,
  getPaidVoteRedirectQueryState,
} from "./paid-vote-redirect-query";
import { mapPaidVoteStatusResponseToHomeState } from "./paid-vote-confirmation-state";

const visibleText = (html: string) => html.replaceAll("<!-- -->", "");
const createHomeRequest = (url = "https://country-ranking.test/") =>
  new Request(url);
const expectNamesInHtmlOrder = (html: string, names: readonly string[]) => {
  const nameIndexes = names.map((name) => html.indexOf(name));

  expect(nameIndexes).not.toContain(-1);

  for (let index = 1; index < nameIndexes.length; index += 1) {
    expect(nameIndexes[index]).toBeGreaterThan(nameIndexes[index - 1]);
  }
};

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

const displayNameSortCountries = [
  {
    code: "AE",
    name: "United Arab Emirates",
    capital: "Abu Dhabi",
    factSnippet: "Test snippet for the United Arab Emirates.",
    flagImageUrl: "https://example.com/ae.svg",
    likes: 20,
    dislikes: 3,
  },
  {
    code: "AO",
    name: "Angola",
    capital: "Luanda",
    factSnippet: "Test snippet for Angola.",
    flagImageUrl: "https://example.com/ao.svg",
    likes: 7,
    dislikes: 1,
  },
  {
    code: "AL",
    name: "Albania",
    capital: "Tirana",
    factSnippet: "Test snippet for Albania.",
    flagImageUrl: "https://example.com/al.svg",
    likes: 9,
    dislikes: 2,
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
    code: "AR",
    name: "Argentina",
    capital: "Buenos Aires",
    factSnippet: "Test snippet for Argentina.",
    flagImageUrl: "https://example.com/ar.svg",
    likes: 11,
    dislikes: 4,
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

  it("loads paid vote confirmation state for a detected checkout return session", async () => {
    const handleCheckoutStatus = vi.fn(() =>
      Response.json({
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
    );

    await expect(
      loadHomeRouteData(
        createHomeRequest(
          "https://country-ranking.test/?session_id=cs_test_paid_vote_123",
        ),
        {
          readCountries: () => okAsync(countries),
          handleCheckoutStatus,
        },
      ),
    ).resolves.toEqual({
      countries,
      paidVoteConfirmation: {
        status: "applied",
        countryCode: "JP",
        voteType: "like",
        totals: {
          countryCode: "JP",
          likes: 13,
          dislikes: 4,
        },
      },
    });

    expect(handleCheckoutStatus).toHaveBeenCalledOnce();
    expect(handleCheckoutStatus.mock.calls[0]?.[0].url).toBe(
      "https://country-ranking.test/checkout-status?session_id=cs_test_paid_vote_123",
    );
  });

  it("loads countries without paid vote confirmation state when no return session is present", async () => {
    const handleCheckoutStatus = vi.fn();

    await expect(
      loadHomeRouteData(createHomeRequest("https://country-ranking.test/"), {
        readCountries: () => okAsync(countries),
        handleCheckoutStatus,
      }),
    ).resolves.toEqual({
      countries,
    });
    expect(handleCheckoutStatus).not.toHaveBeenCalled();
  });

  it("maps pending, invalid, and failed status endpoint responses into explicit route state", async () => {
    await expect(
      loadHomeRouteData(
        createHomeRequest(
          "https://country-ranking.test/?session_id=cs_test_paid_vote_pending",
        ),
        {
          readCountries: () => okAsync(countries),
          handleCheckoutStatus: () =>
            Response.json({
              ok: true,
              data: {
                status: "pending",
              },
            }),
        },
      ),
    ).resolves.toEqual({
      countries,
      paidVoteConfirmation: {
        status: "pending",
      },
    });

    await expect(
      loadHomeRouteData(
        createHomeRequest(
          "https://country-ranking.test/?session_id=cs_test_paid_vote_missing",
        ),
        {
          readCountries: () => okAsync(countries),
          handleCheckoutStatus: () =>
            Response.json({
              ok: true,
              data: {
                status: "not_found",
              },
            }),
        },
      ),
    ).resolves.toEqual({
      countries,
      paidVoteConfirmation: {
        status: "invalid",
        message: "We could not confirm that paid vote session.",
      },
    });

    await expect(
      loadHomeRouteData(
        createHomeRequest(
          "https://country-ranking.test/?session_id=cs_test_paid_vote_failure",
        ),
        {
          readCountries: () => okAsync(countries),
          handleCheckoutStatus: () =>
            Response.json(
              {
                ok: false,
                error: {
                  code: "redis_command_failed",
                  message:
                    "Failed to read paid vote fulfillment record from Redis.",
                },
              },
              { status: 503 },
            ),
        },
      ),
    ).resolves.toEqual({
      countries,
      paidVoteConfirmation: {
        status: "lookup_failed",
        message: "Failed to read paid vote fulfillment record from Redis.",
      },
    });
  });

  it("uses route error handling when the status endpoint response cannot be read", async () => {
    let thrownResponse: unknown;

    try {
      await loadHomeRouteData(
        createHomeRequest(
          "https://country-ranking.test/?session_id=cs_test_paid_vote_bad_endpoint",
        ),
        {
          readCountries: () => okAsync(countries),
          handleCheckoutStatus: () =>
            new Response("Service unavailable", { status: 503 }),
        },
      );
    } catch (response) {
      thrownResponse = response;
    }

    expect(thrownResponse).toBeInstanceOf(Response);

    const routeErrorResponse = thrownResponse as Response;

    expect(routeErrorResponse.status).toBe(502);
    expect(routeErrorResponse.statusText).toBe(
      "Failed to load paid vote status.",
    );
    await expect(routeErrorResponse.text()).resolves.toBe(
      "Failed to load paid vote status.",
    );
  });

  it("renders a searchable list of loaded countries with Redis-backed totals", () => {
    const html = renderToString(<HomeCountriesContent countries={countries} />);

    expect(html).toContain("Countries");
    expect(html).toContain('type="search"');
    expect(html).toContain('id="country-search"');
    expect(html).toContain("Search countries");
    expect(html).toContain("country-filter-transition");
    expect(html).toContain('id="country-search"');
    expect(html.match(/<svg/g)?.length).toBe(1);
    expect(visibleText(html)).not.toContain("Showing");

    for (const country of countries) {
      expect(html).toContain(country.name);
      expect(html).toContain(`${country.name} flag`);
      expect(html).toContain(String(country.likes));
      expect(html).toContain(String(country.dislikes));
    }
  });

  it("renders the unfiltered country list in display-name order", () => {
    const html = renderToString(
      <HomeCountriesContent countries={displayNameSortCountries} />,
    );

    expectNamesInHtmlOrder(html, [
      "Albania",
      "Angola",
      "Argentina",
      "United Arab Emirates",
      "United States",
    ]);
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

  it("keeps matching search results in display-name order", () => {
    const html = renderToString(
      <HomeCountriesContent
        countries={displayNameSortCountries}
        initialSearch="united"
      />,
    );

    expect(html).not.toContain("Albania");
    expect(html).not.toContain("Angola");
    expect(html).not.toContain("Argentina");
    expectNamesInHtmlOrder(html, ["United Arab Emirates", "United States"]);
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

  it("connects applied paid vote route loader state to the dialog adapter", () => {
    const confirmationState = getHomeRoutePaidVoteConfirmationState({
      countries,
      paidVoteConfirmation: {
        status: "applied",
        countryCode: "JP",
        voteType: "like",
        totals: {
          countryCode: "JP",
          likes: 13,
          dislikes: 4,
        },
      },
    });

    expect(toPaidVoteDialogStatus(confirmationState, countries)).toEqual({
      status: "applied",
      country: {
        name: "Japan",
      },
      voteType: "like",
      totals: {
        likes: 13,
        dislikes: 4,
      },
    });
  });

  it("connects pending paid vote route loader state without claiming success", () => {
    const confirmationState = getHomeRoutePaidVoteConfirmationState({
      countries,
      paidVoteConfirmation: {
        status: "pending",
      },
    });

    expect(toPaidVoteDialogStatus(confirmationState, countries)).toEqual({
      status: "pending",
    });
  });

  it("does not render paid vote confirmation from route data without redirect state", () => {
    const html = renderToString(
      <HomeRouteContent
        routeData={{ countries }}
        currentUrl="/"
        onClosePaidVoteConfirmation={() => undefined}
      />,
    );

    expect(visibleText(html)).not.toContain("Paid vote");
  });

  it("renders an applied paid vote confirmation from explicit state", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteConfirmationDialogContent
          countries={countries}
          confirmationState={{
            status: "applied",
            countryCode: "JP",
            voteType: "like",
            totals: {
              countryCode: "JP",
              likes: 13,
              dislikes: 4,
            },
          }}
        />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote applied");
    expect(text).toContain("Your like vote for Japan was applied.");
    expect(text).toContain("Updated totals for Japan");
    expect(text).toContain("13");
    expect(text).toContain("4");
    expect(text).toContain("Close");
  });

  it("renders a pending paid vote confirmation from explicit state", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteConfirmationDialogContent
          countries={countries}
          confirmationState={{ status: "pending" }}
        />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote pending");
    expect(text).toContain("We are still confirming your payment.");
    expect(text).toContain("Your vote has not been applied yet.");
    expect(text).not.toContain("Paid vote applied");
    expect(text).not.toContain("Updated totals");
  });

  it("renders an invalid paid vote confirmation from explicit state", () => {
    const html = renderToString(
      <Dialog open>
        <PaidVoteConfirmationDialogContent
          countries={countries}
          confirmationState={{
            status: "invalid",
            message: "Checkout status request is invalid.",
          }}
        />
      </Dialog>,
    );
    const text = visibleText(html);

    expect(text).toContain("Paid vote not found");
    expect(text).toContain(
      "We could not match this checkout session to a paid vote.",
    );
    expect(text).toContain("unrecognized");
    expect(text).not.toContain("Paid vote applied");
    expect(text).not.toContain("Updated totals");
  });

  it("does not render a paid vote confirmation dialog without explicit state", () => {
    const html = renderToString(
      <PaidVoteConfirmationDialog
        confirmationState={{ status: "absent" }}
        countries={countries}
        currentUrl="/?session_id=cs_test_paid_vote_123"
        onCloseUrlChange={() => undefined}
      />,
    );

    expect(html).toBe("");
  });

  it("closes redirect-backed paid vote confirmation by clearing checkout query state", () => {
    const onCloseUrlChange = vi.fn();

    closePaidVoteConfirmationDialog({
      currentUrl:
        "/?sort=liked&session_id=cs_test_paid_vote_123&filter=asia#countries",
      onCloseUrlChange,
    });

    expect(onCloseUrlChange).toHaveBeenCalledOnce();
    expect(onCloseUrlChange).toHaveBeenCalledWith(
      "/?sort=liked&filter=asia#countries",
    );
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

  it("sorts countries by display name without using ISO code order", () => {
    expect(
      sortCountriesByDisplayName(displayNameSortCountries).map(
        ({ name }) => name,
      ),
    ).toEqual([
      "Albania",
      "Angola",
      "Argentina",
      "United Arab Emirates",
      "United States",
    ]);
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
