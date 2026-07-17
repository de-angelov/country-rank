export type ServerErrorResponseInput = Readonly<{
  publicMessage: string;
  status: number;
  code: string;
  requestId?: string;
}>;

export type ServerErrorResponseBody = Readonly<{
  ok: false;
  error: Readonly<{
    code: string;
    message: string;
    requestId?: string;
  }>;
}>;

export const createServerErrorResponse = ({
  publicMessage,
  status,
  code,
  requestId,
}: ServerErrorResponseInput) => {
  const body: ServerErrorResponseBody = {
    ok: false,
    error: {
      code,
      message: publicMessage,
      ...(requestId ? { requestId } : {}),
    },
  };

  return Response.json(body, { status });
};
