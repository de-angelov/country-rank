import type { Route } from "./+types/votes";

import { validateVoteRequest } from "~/votes/request.server";
import {
  incrementCountryVoteTotal,
  type RedisVoteStorageError,
} from "~/votes/storage.server";

const readVoteRequestPayload = async (request: Request) => {
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await request.json().catch(() => undefined);

    if (body && typeof body === "object") {
      return {
        countryCode: "countryCode" in body ? body.countryCode : undefined,
        voteType: "voteType" in body ? body.voteType : undefined,
      };
    }

    return {
      countryCode: undefined,
      voteType: undefined,
    };
  }

  const formData = await request.formData();

  return {
    countryCode: formData.get("countryCode"),
    voteType: formData.get("voteType"),
  };
};

const handleVoteRequest = async (request: Request) => {
  const result = validateVoteRequest(await readVoteRequestPayload(request));

  if (result.isErr()) {
    return Response.json(
      {
        ok: false,
        error: result.error,
      },
      { status: 400 },
    );
  }

  const incrementResult = await incrementCountryVoteTotal(
    result.value.countryCode,
    result.value.voteType,
  );

  if (incrementResult.isErr()) {
    return Response.json(
      {
        ok: false,
        error: toVoteStorageResponseError(incrementResult.error),
      },
      { status: toVoteStorageResponseStatus(incrementResult.error) },
    );
  }

  return Response.json(
    {
      ok: true,
      data: {
        countryCode: incrementResult.value.countryCode,
        voteType: result.value.voteType,
        totals: {
          likes: incrementResult.value.likes,
          dislikes: incrementResult.value.dislikes,
        },
      },
    },
    { status: 200 },
  );
};

const toVoteStorageResponseStatus = (error: RedisVoteStorageError) =>
  error.code === "invalid_country_code" ? 400 : 503;

const toVoteStorageResponseError = (error: RedisVoteStorageError) => {
  if (error.code === "missing_redis_config") {
    return {
      code: error.code,
      message: error.message,
      envVar: error.envVar,
    };
  }

  if (error.code === "invalid_country_code") {
    return {
      code: error.code,
      message: error.message,
      countryCode: error.countryCode,
    };
  }

  return {
    code: error.code,
    message: error.message,
  };
};

export async function action({ request }: Route.ActionArgs) {
  return handleVoteRequest(request);
}
