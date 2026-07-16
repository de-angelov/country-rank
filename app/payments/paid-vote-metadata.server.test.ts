import { describe, expect, it } from "vitest";

import { parseStripePaidVoteMetadata } from "./paid-vote-metadata.server";

describe("parseStripePaidVoteMetadata", () => {
  it("parses approved Stripe paid vote metadata", () => {
    const result = parseStripePaidVoteMetadata({
      countryCode: "jp",
      voteType: "like",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      countryCode: "JP",
      voteType: "like",
    });
  });

  it("returns a typed error when countryCode metadata is missing", () => {
    const result = parseStripePaidVoteMetadata({
      voteType: "like",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors: {
        countryCode: "Stripe paid vote metadata must include countryCode.",
      },
    });
  });

  it("returns a typed error when voteType metadata is missing", () => {
    const result = parseStripePaidVoteMetadata({
      countryCode: "DE",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors: {
        voteType: "Stripe paid vote metadata must include voteType.",
      },
    });
  });

  it("returns a typed error when voteType metadata is unsupported", () => {
    const result = parseStripePaidVoteMetadata({
      countryCode: "CA",
      voteType: "upvote",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors: {
        voteType: "Vote type must be like or dislike.",
      },
    });
  });

  it("returns a typed error when countryCode metadata is malformed", () => {
    const result = parseStripePaidVoteMetadata({
      countryCode: "USA",
      voteType: "dislike",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors: {
        countryCode: "Country code must match a supported country.",
      },
    });
  });
});
