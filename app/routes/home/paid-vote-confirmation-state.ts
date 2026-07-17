type PaidVoteKind = "like" | "dislike";

type PaidVoteTotals = Readonly<{
  countryCode: string;
  likes: number;
  dislikes: number;
}>;

type PaidVoteStatusAppliedResponse = Readonly<{
  ok: true;
  data: Readonly<{
    status: "applied";
    countryCode: string;
    voteType: PaidVoteKind;
    totals?: PaidVoteTotals;
  }>;
}>;

type PaidVoteStatusPendingResponse = Readonly<{
  ok: true;
  data: Readonly<{
    status: "pending";
  }>;
}>;

type PaidVoteStatusNotFoundResponse = Readonly<{
  ok: true;
  data: Readonly<{
    status: "not_found";
  }>;
}>;

type PaidVoteStatusInvalidSessionResponse = Readonly<{
  ok: false;
  error: Readonly<{
    code: "invalid_checkout_status_request";
    message: string;
    fieldErrors?: Readonly<{
      session_id?: string;
    }>;
  }>;
}>;

type PaidVoteStatusLookupFailedResponse = Readonly<{
  ok: false;
  error: Readonly<{
    code:
      | "missing_redis_config"
      | "malformed_paid_vote_fulfillment"
      | "redis_connection_failed"
      | "redis_command_failed";
    message: string;
  }>;
}>;

export type PaidVoteStatusResponse =
  | PaidVoteStatusAppliedResponse
  | PaidVoteStatusPendingResponse
  | PaidVoteStatusNotFoundResponse
  | PaidVoteStatusInvalidSessionResponse
  | PaidVoteStatusLookupFailedResponse;

export type HomePaidVoteConfirmationState =
  | Readonly<{
      status: "applied";
      countryCode: string;
      voteType: PaidVoteKind;
      totals?: PaidVoteTotals;
    }>
  | Readonly<{
      status: "pending";
    }>
  | Readonly<{
      status: "invalid";
      message: string;
    }>
  | Readonly<{
      status: "lookup_failed";
      message: string;
    }>;

const invalidPaidVoteSessionMessage =
  "We could not confirm that paid vote session.";

export function mapPaidVoteStatusResponseToHomeState(
  response: PaidVoteStatusResponse,
): HomePaidVoteConfirmationState {
  if (!response.ok) {
    if (response.error.code === "invalid_checkout_status_request") {
      return {
        status: "invalid",
        message: response.error.message,
      };
    }

    return {
      status: "lookup_failed",
      message: response.error.message,
    };
  }

  if (response.data.status === "applied") {
    return {
      status: "applied",
      countryCode: response.data.countryCode,
      voteType: response.data.voteType,
      ...(response.data.totals === undefined
        ? {}
        : { totals: response.data.totals }),
    };
  }

  if (response.data.status === "pending") {
    return {
      status: "pending",
    };
  }

  return {
    status: "invalid",
    message: invalidPaidVoteSessionMessage,
  };
}
