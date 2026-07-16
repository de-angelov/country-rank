import type { ResultAsync } from "neverthrow";

import {
  incrementCountryVoteTotal,
  type RedisVoteStorageError,
  type VoteKind,
  type VoteTotals,
} from "./storage.server";

export type ValidatedPaidVote = Readonly<{
  countryCode: string;
  voteType: VoteKind;
}>;

export type AppliedPaidVote = Readonly<{
  status: "applied";
  countryCode: string;
  voteType: VoteKind;
  totals: VoteTotals;
}>;

export type PaidVoteApplicationError = Readonly<{
  code: "paid_vote_application_failed";
  message: string;
  cause: RedisVoteStorageError;
}>;

type IncrementCountryVoteTotal = typeof incrementCountryVoteTotal;

export type PaidVoteApplicationOptions = Readonly<{
  incrementVoteTotal?: IncrementCountryVoteTotal;
}>;

export const createPaidVoteApplication = (
  options: PaidVoteApplicationOptions = {},
) => {
  const incrementVoteTotal =
    options.incrementVoteTotal ?? incrementCountryVoteTotal;

  const applyPaidVote = (
    vote: ValidatedPaidVote,
  ): ResultAsync<AppliedPaidVote, PaidVoteApplicationError> =>
    incrementVoteTotal(vote.countryCode, vote.voteType)
      .map((totals) => ({
        status: "applied" as const,
        countryCode: totals.countryCode,
        voteType: vote.voteType,
        totals,
      }))
      .mapErr((cause) => ({
        code: "paid_vote_application_failed" as const,
        message: "Failed to apply paid vote to Redis totals.",
        cause,
      }));

  return {
    applyPaidVote,
  };
};

export const { applyPaidVote } = createPaidVoteApplication();
