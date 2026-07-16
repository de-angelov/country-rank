import { err, ok, type Result } from "neverthrow";

import { validateVoteRequest } from "~/votes/request.server";
import type { VoteKind } from "~/votes/storage.server";

export type StripePaidVoteMetadata = Readonly<{
  countryCode: string;
  voteType: VoteKind;
}>;

export type StripePaidVoteMetadataError = Readonly<{
  code: "invalid_stripe_paid_vote_metadata";
  message: string;
  fieldErrors: Readonly<{
    countryCode?: string;
    voteType?: string;
  }>;
}>;

export type StripePaidVoteMetadataResult = Result<
  StripePaidVoteMetadata,
  StripePaidVoteMetadataError
>;

export const parseStripePaidVoteMetadata = (
  metadata: Readonly<Record<string, unknown>> | null | undefined,
): StripePaidVoteMetadataResult => {
  const countryCode = metadata?.countryCode;
  const voteType = metadata?.voteType;
  const fieldErrors: StripePaidVoteMetadataError["fieldErrors"] = {};

  if (countryCode === undefined || countryCode === null || countryCode === "") {
    fieldErrors.countryCode =
      "Stripe paid vote metadata must include countryCode.";
  }

  if (voteType === undefined || voteType === null || voteType === "") {
    fieldErrors.voteType = "Stripe paid vote metadata must include voteType.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return err({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors,
    });
  }

  const validationResult = validateVoteRequest({
    countryCode,
    voteType,
  });

  if (validationResult.isErr()) {
    return err({
      code: "invalid_stripe_paid_vote_metadata",
      message: "Stripe paid vote metadata is invalid.",
      fieldErrors: validationResult.error.fieldErrors,
    });
  }

  return ok({
    countryCode: validationResult.value.countryCode,
    voteType: validationResult.value.voteType,
  });
};
