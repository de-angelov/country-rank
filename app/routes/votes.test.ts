import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { action } from "./votes";
import { incrementCountryVoteTotal } from "~/votes/storage.server";

vi.mock("~/votes/storage.server", () => ({
  incrementCountryVoteTotal: vi.fn(),
}));

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

describe("vote request route", () => {
  beforeEach(() => {
    vi.mocked(incrementCountryVoteTotal).mockReset();
  });

  it("increments Redis totals for valid form payloads", async () => {
    vi.mocked(incrementCountryVoteTotal).mockReturnValue(
      okAsync({
        countryCode: "JP",
        likes: 7,
        dislikes: 4,
      }),
    );
    const formData = new FormData();
    formData.set("countryCode", "jp");
    formData.set("voteType", "dislike");

    const response = await action({
      request: new Request("https://example.test/votes", {
        method: "POST",
        body: formData,
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        countryCode: "JP",
        voteType: "dislike",
        totals: {
          likes: 7,
          dislikes: 4,
        },
      },
    });
    expect(incrementCountryVoteTotal).toHaveBeenCalledWith("JP", "dislike");
  });

  it("returns a typed validation error response for invalid JSON payloads", async () => {
    const response = await action({
      request: new Request("https://example.test/votes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "Atlantis",
          voteType: "love",
        }),
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "invalid_vote_request",
        message: "Vote request payload is invalid.",
        fieldErrors: {
          countryCode: "Country code must match a supported country.",
          voteType: "Vote type must be like or dislike.",
        },
      },
    });
    expect(incrementCountryVoteTotal).not.toHaveBeenCalled();
  });

  it("returns a typed Redis failure response when incrementing fails", async () => {
    vi.mocked(incrementCountryVoteTotal).mockReturnValue(
      errAsync({
        code: "redis_command_failed",
        message: "Failed to increment country vote total in Redis.",
        cause: new Error("boom"),
      }),
    );

    const response = await action({
      request: new Request("https://example.test/votes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          countryCode: "DE",
          voteType: "like",
        }),
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({
      ok: false,
      error: {
        code: "redis_command_failed",
        message: "Failed to increment country vote total in Redis.",
      },
    });
  });
});
