import type { Route } from "./+types/votes";

import { validateVoteRequest } from "~/votes/request.server";

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

  return Response.json(
    {
      ok: true,
      data: result.value,
    },
    { status: 202 },
  );
};

export async function action({ request }: Route.ActionArgs) {
  return handleVoteRequest(request);
}
