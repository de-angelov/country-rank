import { okAsync, type ResultAsync } from "neverthrow";

import { logger, type ApplicationLogger } from "~/lib/logger.server";
import {
  claimPaidVoteFulfillmentRecord,
  readPaidVoteFulfillmentRecord,
  writePaidVoteFulfillmentRecord,
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
      code: "paid_vote_fulfillment_claim_failed";
      message: string;
      checkoutSessionId: string;
      cause: RedisPaidVoteFulfillmentError;
    }>
  | Readonly<{
      code: "paid_vote_fulfillment_write_failed";
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
type ClaimPaidVoteFulfillmentRecord =
  typeof claimPaidVoteFulfillmentRecord;
type ReadPaidVoteFulfillmentRecord = typeof readPaidVoteFulfillmentRecord;
type WritePaidVoteFulfillmentRecord = typeof writePaidVoteFulfillmentRecord;

export type PaidVoteApplicationOptions = Readonly<{
  incrementVoteTotal?: IncrementCountryVoteTotal;
  claimFulfillmentRecord?: ClaimPaidVoteFulfillmentRecord;
  readFulfillmentRecord?: ReadPaidVoteFulfillmentRecord;
  writeFulfillmentRecord?: WritePaidVoteFulfillmentRecord;
  logger?: ApplicationLogger;
}>;

export const createPaidVoteApplication = (
  options: PaidVoteApplicationOptions = {},
) => {
  const incrementVoteTotal =
    options.incrementVoteTotal ?? incrementCountryVoteTotal;
  const claimFulfillmentRecord =
    options.claimFulfillmentRecord ?? claimPaidVoteFulfillmentRecord;
  const readFulfillmentRecord =
    options.readFulfillmentRecord ?? readPaidVoteFulfillmentRecord;
  const writeFulfillmentRecord =
    options.writeFulfillmentRecord ?? writePaidVoteFulfillmentRecord;
  const paymentLogger = options.logger ?? logger;

  const applyPaidVote = (
    vote: ValidatedPaidVote,
  ): ResultAsync<PaidVoteApplicationResult, PaidVoteApplicationError> =>
    claimFulfillmentRecord(vote)
      .mapErr((cause) => {
        paymentLogger.error(
          {
            action: "claim_paid_vote_fulfillment",
            errorCode: "paid_vote_fulfillment_claim_failed",
            causeCode: cause.code,
            checkoutSessionId: vote.checkoutSessionId,
            countryCode: vote.countryCode,
            voteType: vote.voteType,
          },
          "Failed to claim paid vote fulfillment before applying vote.",
        );

        return {
          code: "paid_vote_fulfillment_claim_failed" as const,
          message:
            "Failed to claim paid vote fulfillment before applying vote.",
          checkoutSessionId: vote.checkoutSessionId,
          cause,
        };
      })
      .andThen((claim) => {
        if (claim.status === "duplicate") {
          paymentLogger.info(
            {
              action: "skip_duplicate_paid_vote",
              checkoutSessionId: vote.checkoutSessionId,
              countryCode: vote.countryCode,
              voteType: vote.voteType,
            },
            "Skipped duplicate paid vote fulfillment.",
          );

          return readFulfillmentRecord(vote.checkoutSessionId)
            .map(toDuplicatePaidVoteFromReadResult(vote))
            .orElse((cause) => {
              paymentLogger.warn(
                {
                  action: "read_duplicate_paid_vote_fulfillment",
                  errorCode: cause.code,
                  checkoutSessionId: vote.checkoutSessionId,
                  countryCode: vote.countryCode,
                  voteType: vote.voteType,
                },
                "Failed to read duplicate paid vote fulfillment after claim.",
              );

              return okAsync(toDuplicatePaidVote(vote));
            });
        }

        return incrementVoteTotal(vote.countryCode, vote.voteType)
          .mapErr((cause) => {
            paymentLogger.error(
              {
                action: "apply_paid_vote_total",
                errorCode: "paid_vote_application_failed",
                causeCode: cause.code,
                checkoutSessionId: vote.checkoutSessionId,
                countryCode: vote.countryCode,
                voteType: vote.voteType,
              },
              "Failed to apply paid vote to Redis totals.",
            );

            return {
              code: "paid_vote_application_failed" as const,
              message: "Failed to apply paid vote to Redis totals.",
              cause,
            };
          })
          .map((totals) => ({
            status: "applied" as const,
            checkoutSessionId: vote.checkoutSessionId,
            countryCode: totals.countryCode,
            voteType: vote.voteType,
            totals,
          }))
          .andThen((appliedVote) =>
            writeFulfillmentRecord(appliedVote)
              .map(() => appliedVote)
              .mapErr((cause) => {
                paymentLogger.error(
                  {
                    action: "write_paid_vote_fulfillment",
                    errorCode: "paid_vote_fulfillment_write_failed",
                    causeCode: cause.code,
                    checkoutSessionId: vote.checkoutSessionId,
                    countryCode: vote.countryCode,
                    voteType: vote.voteType,
                  },
                  "Failed to write paid vote fulfillment after applying vote.",
                );

                return {
                  code: "paid_vote_fulfillment_write_failed" as const,
                  message:
                    "Failed to write paid vote fulfillment after applying vote.",
                  checkoutSessionId: vote.checkoutSessionId,
                  cause,
                };
              }),
          );
      });

  return {
    applyPaidVote,
  };
};

export const { applyPaidVote } = createPaidVoteApplication();

const toDuplicatePaidVote = (
  fulfillment: ValidatedPaidVote | Extract<
    PaidVoteFulfillmentReadResult,
    { status: "applied" | "pending" }
  >,
): DuplicatePaidVote => ({
  status: "duplicate",
  checkoutSessionId: fulfillment.checkoutSessionId,
  countryCode: fulfillment.countryCode,
  voteType: fulfillment.voteType,
  ...(!("totals" in fulfillment) || fulfillment.totals === undefined
    ? {}
    : { totals: fulfillment.totals }),
});

const toDuplicatePaidVoteFromReadResult =
  (vote: ValidatedPaidVote) =>
  (fulfillment: PaidVoteFulfillmentReadResult): DuplicatePaidVote => {
    if (
      fulfillment.status === "applied" ||
      fulfillment.status === "pending"
    ) {
      return toDuplicatePaidVote(fulfillment);
    }

    return toDuplicatePaidVote(vote);
  };
