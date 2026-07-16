import { describe, expect, it } from "vitest";

import { validateVoteRequest } from "./request.server";

describe("validateVoteRequest", () => {
  it("accepts supported country codes and vote types", () => {
    const result = validateVoteRequest({
      countryCode: "us",
      voteType: "like",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "accepted",
      countryCode: "US",
      voteType: "like",
    });
  });

  it("returns typed validation errors for invalid payloads", () => {
    const result = validateVoteRequest({
      countryCode: "XX",
      voteType: "upvote",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual({
      code: "invalid_vote_request",
      message: "Vote request payload is invalid.",
      fieldErrors: {
        countryCode: "Country code must match a supported country.",
        voteType: "Vote type must be like or dislike.",
      },
    });
  });
});
