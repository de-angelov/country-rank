import { okAsync, type ResultAsync } from "neverthrow";

import { logger, type ApplicationLogger } from "~/lib/logger.server";
import {
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
      code: "paid_vote_fulfillment_read_failed";
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
type ReadPaidVoteFulfillmentRecord = typeof readPaidVoteFulfillmentRecord;
type WritePaidVoteFulfillmentRecord = typeof writePaidVoteFulfillmentRecord;

export type PaidVoteApplicationOptions = Readonly<{
  incrementVoteTotal?: IncrementCountryVoteTotal;
  readFulfillmentRecord?: ReadPaidVoteFulfillmentRecord;
  writeFulfillmentRecord?: WritePaidVoteFulfillmentRecord;
  logger?: ApplicationLogger;
}>;

export const createPaidVoteApplication = (
  options: PaidVoteApplicationOptions = {},
) => {
  const incrementVoteTotal =
    options.incrementVoteTotal ?? incrementCountryVoteTotal;
  const readFulfillmentRecord =
    options.readFulfillmentRecord ?? readPaidVoteFulfillmentRecord;
  const writeFulfillmentRecord =
    options.writeFulfillmentRecord ?? writePaidVoteFulfillmentRecord;
  const paymentLogger = options.logger ?? logger;

  const applyPaidVote = (
    vote: ValidatedPaidVote,
  ): ResultAsync<PaidVoteApplicationResult, PaidVoteApplicationError> =>
    readFulfillmentRecord(vote.checkoutSessionId)
      .mapErr((cause) => {
        paymentLogger.error(
          {
            action: "read_paid_vote_fulfillment",
            errorCode: "paid_vote_fulfillment_read_failed",
            causeCode: cause.code,
            checkoutSessionId: vote.checkoutSessionId,
            countryCode: vote.countryCode,
            voteType: vote.voteType,
          },
          "Failed to read paid vote fulfillment before applying vote.",
        );

        return {
          code: "paid_vote_fulfillment_read_failed" as const,
          message: "Failed to read paid vote fulfillment before applying vote.",
          checkoutSessionId: vote.checkoutSessionId,
          cause,
        };
      })
      .andThen((fulfillment) => {
        if (fulfillment.status === "applied") {
          paymentLogger.info(
            {
              action: "skip_duplicate_paid_vote",
              checkoutSessionId: fulfillment.checkoutSessionId,
              countryCode: fulfillment.countryCode,
              voteType: fulfillment.voteType,
            },
            "Skipped duplicate paid vote fulfillment.",
          );

          return okAsync(toDuplicatePaidVote(fulfillment));
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
  fulfillment: Extract<PaidVoteFulfillmentReadResult, { status: "applied" }>,
): DuplicatePaidVote => ({
  status: "duplicate",
  checkoutSessionId: fulfillment.checkoutSessionId,
  countryCode: fulfillment.countryCode,
  voteType: fulfillment.voteType,
  ...(fulfillment.totals === undefined ? {} : { totals: fulfillment.totals }),
});
