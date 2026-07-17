const stripeCheckoutSessionIdPattern = /^cs_(test|live)_[A-Za-z0-9_]+$/;
const relativeUrlBase = "https://country-ranking.local";

type UrlInput = URL | string;

export type PaidVoteRedirectQueryState =
  | Readonly<{
      status: "present";
      sessionId: string;
    }>
  | Readonly<{
      status: "absent";
    }>;

export function getPaidVoteRedirectQueryState(
  url: UrlInput,
): PaidVoteRedirectQueryState {
  const checkoutSessionId = toUrl(url).searchParams.get("session_id")?.trim();

  if (
    checkoutSessionId === undefined ||
    !stripeCheckoutSessionIdPattern.test(checkoutSessionId)
  ) {
    return { status: "absent" };
  }

  return {
    status: "present",
    sessionId: checkoutSessionId,
  };
}

export function clearPaidVoteRedirectQueryState(url: UrlInput): string {
  const nextUrl = toUrl(url);

  nextUrl.searchParams.delete("session_id");

  return shouldReturnRelativeUrl(url)
    ? `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
    : nextUrl.href;
}

function toUrl(url: UrlInput): URL {
  return url instanceof URL ? new URL(url.href) : new URL(url, relativeUrlBase);
}

function shouldReturnRelativeUrl(url: UrlInput) {
  return typeof url === "string" && !/^[A-Za-z][A-Za-z\d+.-]*:/.test(url);
}
