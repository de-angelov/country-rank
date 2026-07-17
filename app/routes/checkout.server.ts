import { logger, type ApplicationLogger } from "~/lib/logger.server";
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
  logger?: ApplicationLogger;
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
    const paymentLogger = options.logger ?? logger;
    const payload = await readVoteRequestPayload(request);
    const checkoutRequestResult = validateStripeCheckoutRequest(payload, env);

    if (checkoutRequestResult.isErr()) {
      if (checkoutRequestResult.error.code === "missing_stripe_checkout_config") {
        paymentLogger.error(
          {
            route: "checkout",
            action: "read_stripe_checkout_config",
            errorCode: checkoutRequestResult.error.code,
            envVar: checkoutRequestResult.error.envVar,
            ...getRequestLogContext(request),
          },
          "Stripe checkout configuration was missing.",
        );
      }

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
      paymentLogger.error(
        {
          route: "checkout",
          action: "create_stripe_checkout_session",
          errorCode: sessionResult.error.code,
          countryCode: checkoutRequestResult.value.countryCode,
          voteType: checkoutRequestResult.value.voteType,
          ...getRequestLogContext(request),
        },
        "Stripe checkout session creation failed.",
      );

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
      message: "We couldn't start checkout. Please try again in a moment.",
    };
  }

  return {
    code: error.code,
    message: "We couldn't start checkout because the vote request is invalid.",
    fieldErrors: error.fieldErrors,
  };
};

const toStripeCheckoutSessionResponseError = (
  error: StripeCheckoutSessionError,
) => ({
  code: error.code,
  message: "We couldn't start checkout. Please try again in a moment.",
});

const getRequestLogContext = (request: Request) => {
  const requestId =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id");

  return requestId ? { requestId } : {};
};
