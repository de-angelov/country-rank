import { describe, expect, it } from "vitest";

import { action } from "./votes";

const readJson = async (response: Response) =>
  (await response.json()) as unknown;

describe("vote request route", () => {
  it("returns a placeholder success response for valid form payloads", async () => {
    const formData = new FormData();
    formData.set("countryCode", "JP");
    formData.set("voteType", "dislike");

    const response = await action({
      request: new Request("https://example.test/votes", {
        method: "POST",
        body: formData,
      }),
      params: {},
      context: {},
    });

    expect(response.status).toBe(202);
    expect(await readJson(response)).toEqual({
      ok: true,
      data: {
        status: "accepted",
        countryCode: "JP",
        voteType: "dislike",
      },
    });
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
  });
});
