import { okAsync, type ResultAsync } from "neverthrow";

import {
  readPaidVoteFulfillmentRecord,
  type PaidVoteFulfillmentReadResult,
  type RedisPaidVoteFulfillmentError,
} from "./fulfillment.server";
import {
  incrementCountryVoteTotal,
  type RedisVoteStorageError,
  type VoteKind,
  type VoteTotals,
} from "./storage.server";

export type ValidatedPaidVote = Readonly<{
  checkoutSessionId: string;
  countryCode: string;
  voteType: VoteKind;
}>;

export type AppliedPaidVote = Readonly<{
  status: "applied";
  checkoutSessionId: string;
  countryCode: string;
  voteType: VoteKind;
  totals: VoteTotals;
}>;

export type DuplicatePaidVote = Readonly<{
  status: "duplicate";
  checkoutSessionId: string;
  countryCode: string;
  voteType: VoteKind;
  totals?: VoteTotals;
}>;

export type PaidVoteApplicationResult = AppliedPaidVote | DuplicatePaidVote;

export type PaidVoteApplicationError =
  | Readonly<{
      code: "paid_vote_fulfillment_read_failed";
      message: string;
      checkoutSessionId: string;
      cause: RedisPaidVoteFulfillmentError;
    }>
  | Readonly<{
      code: "paid_vote_application_failed";
      message: string;
      cause: RedisVoteStorageError;
    }>;

type IncrementCountryVoteTotal = typeof incrementCountryVoteTotal;
type ReadPaidVoteFulfillmentRecord = typeof readPaidVoteFulfillmentRecord;

export type PaidVoteApplicationOptions = Readonly<{
  incrementVoteTotal?: IncrementCountryVoteTotal;
  readFulfillmentRecord?: ReadPaidVoteFulfillmentRecord;
}>;

export const createPaidVoteApplication = (
  options: PaidVoteApplicationOptions = {},
) => {
  const incrementVoteTotal =
    options.incrementVoteTotal ?? incrementCountryVoteTotal;
  const readFulfillmentRecord =
    options.readFulfillmentRecord ?? readPaidVoteFulfillmentRecord;

  const applyPaidVote = (
    vote: ValidatedPaidVote,
  ): ResultAsync<PaidVoteApplicationResult, PaidVoteApplicationError> =>
    readFulfillmentRecord(vote.checkoutSessionId)
      .mapErr((cause) => ({
        code: "paid_vote_fulfillment_read_failed" as const,
        message: "Failed to read paid vote fulfillment before applying vote.",
        checkoutSessionId: vote.checkoutSessionId,
        cause,
      }))
      .andThen((fulfillment) => {
        if (fulfillment.status === "applied") {
          return okAsync(toDuplicatePaidVote(fulfillment));
        }

        return incrementVoteTotal(vote.countryCode, vote.voteType)
          .map((totals) => ({
            status: "applied" as const,
            checkoutSessionId: vote.checkoutSessionId,
            countryCode: totals.countryCode,
            voteType: vote.voteType,
            totals,
          }))
          .mapErr((cause) => ({
            code: "paid_vote_application_failed" as const,
            message: "Failed to apply paid vote to Redis totals.",
            cause,
          }));
      });

  return {
    applyPaidVote,
  };
};

export const { applyPaidVote } = createPaidVoteApplication();

const toDuplicatePaidVote = (
  fulfillment: Extract<PaidVoteFulfillmentReadResult, { status: "applied" }>,
): DuplicatePaidVote => ({
  status: "duplicate",
  checkoutSessionId: fulfillment.checkoutSessionId,
  countryCode: fulfillment.countryCode,
  voteType: fulfillment.voteType,
  ...(fulfillment.totals === undefined ? {} : { totals: fulfillment.totals }),
});
