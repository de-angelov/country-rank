import {
  createStripeCheckoutSession,
  getStripeCheckoutConfig,
  validateStripeCheckoutRequest,
  type CreateStripeCheckoutSession,
  type StripeCheckoutSessionError,
  type StripeCheckoutRequestError,
} from "~/payments/stripe-checkout.server";
import type { VoteRequestPayload } from "~/votes/request.server";

type CheckoutHandlerOptions = Readonly<{
  env?: NodeJS.ProcessEnv;
  createSession?: CreateStripeCheckoutSession;
}>;

const readVoteRequestPayload = async (
  request: Request,
): Promise<VoteRequestPayload> => {
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

export const createCheckoutHandler =
  (options: CheckoutHandlerOptions = {}) =>
  async (request: Request) => {
    const env = options.env ?? process.env;
    const payload = await readVoteRequestPayload(request);
    const checkoutRequestResult = validateStripeCheckoutRequest(payload, env);

    if (checkoutRequestResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: toCheckoutRequestResponseError(checkoutRequestResult.error),
        },
        { status: toCheckoutRequestResponseStatus(checkoutRequestResult.error) },
      );
    }

    const configResult = getStripeCheckoutConfig(env);

    if (configResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: toCheckoutRequestResponseError(configResult.error),
        },
        { status: toCheckoutRequestResponseStatus(configResult.error) },
      );
    }

    const sessionResult = await createStripeCheckoutSession(
      checkoutRequestResult.value,
      {
        config: configResult.value,
        appBaseUrl: new URL(request.url).origin,
        createSession: options.createSession,
      },
    );

    if (sessionResult.isErr()) {
      return Response.json(
        {
          ok: false,
          error: toStripeCheckoutSessionResponseError(sessionResult.error),
        },
        { status: 502 },
      );
    }

    if (request.headers.get("content-type")?.includes("application/json")) {
      return Response.json(
        {
          ok: true,
          data: {
            checkoutUrl: sessionResult.value.checkoutUrl,
          },
        },
        { status: 200 },
      );
    }

    return Response.redirect(sessionResult.value.checkoutUrl, 303);
  };

export const handleCheckout = createCheckoutHandler();

const toCheckoutRequestResponseStatus = (error: StripeCheckoutRequestError) =>
  error.code === "invalid_stripe_checkout_request" ? 400 : 500;

const toCheckoutRequestResponseError = (error: StripeCheckoutRequestError) => {
  if (error.code === "missing_stripe_checkout_config") {
    return {
      code: error.code,
      message: error.message,
      envVar: error.envVar,
    };
  }

  return {
    code: error.code,
    message: error.message,
    fieldErrors: error.fieldErrors,
  };
};

const toStripeCheckoutSessionResponseError = (
  error: StripeCheckoutSessionError,
) => ({
  code: error.code,
  message: error.message,
});
