import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Search } from "lucide-react";
import { useLoaderData } from "react-router";

import { CountryCard } from "~/components/country-card/country-card";
import {
  PaidVoteDialog,
  PaidVoteDialogContent,
  type PaidVoteStatus,
} from "~/components/paid-vote-dialog/paid-vote-dialog";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import type { Country } from "~/countries";

import { loadHomeCountries } from "./home.server";
import type { HomePaidVoteConfirmationState } from "./paid-vote-confirmation-state";
import { clearPaidVoteRedirectQueryState } from "./paid-vote-redirect-query";

export async function loader() {
  return {
    countries: await loadHomeCountries(),
  };
}

export function meta() {
  return [
    { title: "Country Ranking" },
    { name: "description", content: "Search and browse country rankings." },
  ];
}

export function filterCountriesByName(
  countries: readonly Country[],
  searchQuery: string,
) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return countries;
  }

  return countries.filter((country) =>
    country.name.toLocaleLowerCase().includes(normalizedQuery),
  );
}

export type PaidVoteConfirmationState =
  | HomePaidVoteConfirmationState
  | Readonly<{
      status: "absent";
    }>;

type PaidVoteConfirmationDialogProps = Readonly<{
  confirmationState: PaidVoteConfirmationState;
  countries: readonly Country[];
  currentUrl: string;
  onCloseUrlChange: (nextUrl: string) => void;
}>;

export function closePaidVoteConfirmationDialog({
  currentUrl,
  onCloseUrlChange,
}: Pick<
  PaidVoteConfirmationDialogProps,
  "currentUrl" | "onCloseUrlChange"
>) {
  onCloseUrlChange(clearPaidVoteRedirectQueryState(currentUrl));
}

export function PaidVoteConfirmationDialog({
  confirmationState,
  countries,
  currentUrl,
  onCloseUrlChange,
}: PaidVoteConfirmationDialogProps) {
  const dialogStatus = toPaidVoteDialogStatus(confirmationState, countries);

  if (dialogStatus === null) {
    return null;
  }

  return (
    <PaidVoteDialog
      status={dialogStatus}
      onClose={() =>
        closePaidVoteConfirmationDialog({ currentUrl, onCloseUrlChange })
      }
    />
  );
}

export function PaidVoteConfirmationDialogContent({
  confirmationState,
  countries,
}: Pick<PaidVoteConfirmationDialogProps, "confirmationState" | "countries">) {
  const dialogStatus = toPaidVoteDialogStatus(confirmationState, countries);

  if (dialogStatus === null) {
    return null;
  }

  return <PaidVoteDialogContent status={dialogStatus} />;
}

export function toPaidVoteDialogStatus(
  confirmationState: PaidVoteConfirmationState,
  countries: readonly Country[],
): PaidVoteStatus | null {
  if (
    confirmationState.status === "absent" ||
    confirmationState.status === "lookup_failed"
  ) {
    return null;
  }

  if (confirmationState.status === "pending") {
    return { status: "pending" };
  }

  if (confirmationState.status === "invalid") {
    return { status: "invalid" };
  }

  const country = countries.find(
    ({ code }) => code === confirmationState.countryCode,
  );
  const totals = confirmationState.totals ?? country;

  if (country === undefined || totals === undefined) {
    return null;
  }

  return {
    status: "applied",
    country: {
      name: country.name,
    },
    voteType: confirmationState.voteType,
    totals: {
      likes: totals.likes,
      dislikes: totals.dislikes,
    },
  };
}

type SearchViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => unknown;
};

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function updateSearchQueryWithTransition(
  nextSearchQuery: string,
  setSearchQuery: (nextSearchQuery: string) => void,
  afterSearchQueryUpdate: () => void,
) {
  const shouldReduceMotion = prefersReducedMotion();
  const canStartViewTransition =
    typeof document !== "undefined" &&
    !shouldReduceMotion &&
    (document as SearchViewTransitionDocument).startViewTransition !==
      undefined;

  if (!canStartViewTransition) {
    setSearchQuery(nextSearchQuery);
    afterSearchQueryUpdate();
    return;
  }

  (document as SearchViewTransitionDocument).startViewTransition?.(() => {
    flushSync(() => setSearchQuery(nextSearchQuery));
    afterSearchQueryUpdate();
  });
}

export function HomeCountriesContent({
  countries,
  initialSearch = "",
  paidVoteConfirmationState = { status: "absent" },
  paidVoteConfirmationUrl = "/",
  onPaidVoteConfirmationClose = () => undefined,
}: {
  countries: readonly Country[];
  initialSearch?: string;
  paidVoteConfirmationState?: PaidVoteConfirmationState;
  paidVoteConfirmationUrl?: string;
  onPaidVoteConfirmationClose?: (nextUrl: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const searchRef = useRef<HTMLDivElement>(null);
  const filteredCountries = useMemo(
    () => filterCountriesByName(countries, searchQuery),
    [countries, searchQuery],
  );
  const resultCount = filteredCountries.length;
  const scrollToResults = () => {
    window.requestAnimationFrame(() => {
      searchRef.current?.scrollIntoView({
        block: "start",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    });
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <PaidVoteConfirmationDialog
        confirmationState={paidVoteConfirmationState}
        countries={countries}
        currentUrl={paidVoteConfirmationUrl}
        onCloseUrlChange={onPaidVoteConfirmationClose}
      />

      <div className="grid gap-3 md:grid-cols-[1fr_minmax(18rem,24rem)] md:items-end md:gap-4">
        <div>
          <h1 className="text-3xl font-heading sm:text-4xl">Countries</h1>
          <p className="mt-1 max-w-2xl text-base">
            Browse the current country rankings and narrow the list by country
            name.
          </p>
        </div>

        <div className="grid gap-2" id="country-search" ref={searchRef}>
          <label className="font-heading text-sm" htmlFor="country-search">
            Search countries
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2"
            />
            <Input
              id="country-search"
              name="country-search"
              type="search"
              value={searchQuery}
              onChange={(event) =>
                updateSearchQueryWithTransition(
                  event.currentTarget.value,
                  setSearchQuery,
                  scrollToResults,
                )
              }
              placeholder="Country name"
              className="pl-10"
            />
          </div>
        </div>
      </div>

      <div className="country-filter-transition grid gap-4">
        {resultCount > 0 ? (
          <section aria-label="Countries" className="grid gap-4 lg:grid-cols-2">
            {filteredCountries.map((country) => (
              <CountryCard country={country} key={country.code} />
            ))}
          </section>
        ) : (
          <Card className="gap-0 bg-secondary-background p-4 py-4 shadow-none">
            <p>No countries match that search.</p>
          </Card>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  const { countries } = useLoaderData<typeof loader>();

  return <HomeCountriesContent countries={countries} />;
}
