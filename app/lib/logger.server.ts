import pino, { type DestinationStream, type Logger } from "pino";

export const logLevelEnvVar = "LOG_LEVEL";
export const defaultLogLevel = "info";
export const redactedLogValue = "[Redacted]";

export const supportedLogLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type SupportedLogLevel = (typeof supportedLogLevels)[number];
export type ApplicationLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;

const supportedLogLevelSet = new Set<string>(supportedLogLevels);

export const sensitiveLogRedactionPaths = [
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "cookies",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  'headers["set-cookie"]',
  'headers["Set-Cookie"]',
  'headers["stripe-signature"]',
  'headers["Stripe-Signature"]',
  "req.headers.authorization",
  "req.headers.Authorization",
  "req.headers.cookie",
  "req.headers.Cookie",
  'req.headers["stripe-signature"]',
  'req.headers["Stripe-Signature"]',
  "request.headers.authorization",
  "request.headers.Authorization",
  "request.headers.cookie",
  "request.headers.Cookie",
  'request.headers["stripe-signature"]',
  'request.headers["Stripe-Signature"]',
  "stripeSignature",
  "stripe_signature",
  "STRIPE_SECRET_KEY",
  "stripeSecretKey",
  "stripe_secret_key",
  "stripe.secretKey",
  "stripe.secret_key",
  "stripe.apiKey",
  "stripe.api_key",
  "stripeApiKey",
  "stripe_api_key",
  "STRIPE_WEBHOOK_SECRET",
  "stripeWebhookSecret",
  "stripe_webhook_secret",
  "webhookSecret",
  "webhook_secret",
  "stripe.webhookSecret",
  "stripe.webhook_secret",
  "rawBody",
  "rawRequestBody",
  "rawWebhookPayload",
  "body.raw",
  "payload.raw",
  "req.rawBody",
  "request.rawBody",
  "stripe.rawPayload",
  "stripe.rawWebhookPayload",
  "card",
  "cardNumber",
  "card_number",
  "cvc",
  "cvv",
  "paymentMethod",
  "payment_method",
  "paymentMethodData",
  "payment_method_data",
] as const;

export const getLogLevel = (
  env: NodeJS.ProcessEnv = process.env,
): SupportedLogLevel => {
  const configuredLevel = env[logLevelEnvVar]?.trim().toLowerCase();

  if (configuredLevel && supportedLogLevelSet.has(configuredLevel)) {
    return configuredLevel as SupportedLogLevel;
  }

  return defaultLogLevel;
};

export const createApplicationLogger = (
  options: Readonly<{
    env?: NodeJS.ProcessEnv;
    stream?: DestinationStream;
  }> = {},
): Logger =>
  pino(
    {
      level: getLogLevel(options.env),
      redact: {
        paths: [...sensitiveLogRedactionPaths],
        censor: redactedLogValue,
      },
    },
    options.stream,
  );

export const logger = createApplicationLogger();
