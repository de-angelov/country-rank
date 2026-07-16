import { err, ok, type Result } from "neverthrow";

import { countryFixtures } from "~/countries/fixtures";
import type { VoteKind } from "./storage.server";

const validCountryCodes = new Set(countryFixtures.map((country) => country.code));
const validVoteKinds = new Set<VoteKind>(["like", "dislike"]);

export type VoteRequestPayload = Readonly<{
  countryCode: unknown;
  voteType: unknown;
}>;

export type VoteRequestAccepted = Readonly<{
  status: "accepted";
  countryCode: string;
  voteType: VoteKind;
}>;

export type VoteRequestValidationError = Readonly<{
  code: "invalid_vote_request";
  message: string;
  fieldErrors: Readonly<{
    countryCode?: string;
    voteType?: string;
  }>;
}>;

export type VoteRequestResult = Result<
  VoteRequestAccepted,
  VoteRequestValidationError
>;

export const validateVoteRequest = (
  payload: VoteRequestPayload,
): VoteRequestResult => {
  const countryCode =
    typeof payload.countryCode === "string"
      ? payload.countryCode.trim().toUpperCase()
      : "";
  const voteType = payload.voteType;
  const fieldErrors: VoteRequestValidationError["fieldErrors"] = {};

  if (!validCountryCodes.has(countryCode)) {
    fieldErrors.countryCode = "Country code must match a supported country.";
  }

  if (typeof voteType !== "string" || !validVoteKinds.has(voteType as VoteKind)) {
    fieldErrors.voteType = "Vote type must be like or dislike.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return err({
      code: "invalid_vote_request",
      message: "Vote request payload is invalid.",
      fieldErrors,
    });
  }

  return ok({
    status: "accepted",
    countryCode,
    voteType: voteType as VoteKind,
  });
};
