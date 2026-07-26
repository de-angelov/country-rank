import { err, ok, type Result } from "neverthrow";
import { z } from "zod";

import {
  defaultLogLevel,
  supportedLogLevels,
  type SupportedLogLevel,
} from "~/lib/logger.server";

export const serverEnvVars = [
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LOG_LEVEL",
] as const;

export type ServerEnvVar = (typeof serverEnvVars)[number];

export type ServerEnv = Readonly<{
  REDIS_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  LOG_LEVEL: SupportedLogLevel;
}>;

export type ServerEnvIssueCategory =
  | "missing"
  | "malformed"
  | "placeholder"
  | "unsupported";

export type ServerEnvValidationIssue = Readonly<{
  envVar: ServerEnvVar;
  category: ServerEnvIssueCategory;
  message: string;
}>;

export class ServerEnvValidationError extends Error {
  readonly code = "invalid_server_env";
  readonly issues: ReadonlyArray<ServerEnvValidationIssue>;

  constructor(issues: ReadonlyArray<ServerEnvValidationIssue>) {
    super(formatServerEnvErrorMessage(issues));
    this.name = "ServerEnvValidationError";
    this.issues = issues;
  }
}

const envInputSchema = z
  .object({
    REDIS_URL: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    LOG_LEVEL: z.string().optional(),
  })
  .passthrough()
  .superRefine((env, context) => {
    validateRequiredValue(
      context,
      "REDIS_URL",
      env.REDIS_URL,
      "REDIS_URL must be set.",
    );
    validateRequiredValue(
      context,
      "STRIPE_SECRET_KEY",
      env.STRIPE_SECRET_KEY,
      "STRIPE_SECRET_KEY must be set.",
    );
    validateRequiredValue(
      context,
      "STRIPE_WEBHOOK_SECRET",
      env.STRIPE_WEBHOOK_SECRET,
      "STRIPE_WEBHOOK_SECRET must be set.",
    );
  })
  .transform((env, context): ServerEnv => {
    const redisUrl = trimRequired(env.REDIS_URL);
    const stripeSecretKey = trimRequired(env.STRIPE_SECRET_KEY);
    const stripeWebhookSecret = trimRequired(env.STRIPE_WEBHOOK_SECRET);
    const configuredLogLevel = env.LOG_LEVEL?.trim().toLowerCase();
    const logLevel = configuredLogLevel || defaultLogLevel;

    validateRedisUrl(context, redisUrl);
    validateStripeSecretKey(context, stripeSecretKey);
    validateStripeWebhookSecret(context, stripeWebhookSecret);
    validateLogLevel(context, logLevel);

    return {
      REDIS_URL: redisUrl,
      STRIPE_SECRET_KEY: stripeSecretKey,
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      LOG_LEVEL: logLevel as SupportedLogLevel,
    };
  });

export type ServerEnvParseResult = Result<ServerEnv, ServerEnvValidationError>;

export const parseServerEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ServerEnvParseResult => {
  const parseResult = envInputSchema.safeParse(env);

  if (!parseResult.success) {
    return err(
      new ServerEnvValidationError(
        parseResult.error.issues.map(toServerEnvValidationIssue),
      ),
    );
  }

  return ok(parseResult.data);
};

export const getServerEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ServerEnv => {
  const parseResult = parseServerEnv(env);

  if (parseResult.isErr()) {
    throw parseResult.error;
  }

  return parseResult.value;
};

const addIssue = (
  context: z.RefinementCtx,
  envVar: ServerEnvVar,
  category: ServerEnvIssueCategory,
  message: string,
) => {
  context.addIssue({
    code: "custom",
    path: [envVar],
    message,
    params: {
      envVar,
      category,
    },
  });
};

const validateRequiredValue = (
  context: z.RefinementCtx,
  envVar: ServerEnvVar,
  value: string | undefined,
  message: string,
) => {
  if (!value?.trim()) {
    addIssue(context, envVar, "missing", message);
  }
};

const trimRequired = (value: string | undefined): string => value?.trim() ?? "";

const validateRedisUrl = (context: z.RefinementCtx, redisUrl: string) => {
  if (!redisUrl) {
    return;
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    addIssue(context, "REDIS_URL", "malformed", "REDIS_URL must be a Redis URL.");
    return;
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    addIssue(context, "REDIS_URL", "malformed", "REDIS_URL must be a Redis URL.");
  }
};

const stripeSecretKeyPattern = /^sk_(test|live)_[A-Za-z0-9_]+$/;
const stripeWebhookSecretPattern = /^whsec_[A-Za-z0-9_]+$/;

const placeholderValues = {
  STRIPE_SECRET_KEY: new Set(["sk_test_replace_with_local_test_secret"]),
  STRIPE_WEBHOOK_SECRET: new Set([
    "whsec_replace_with_local_or_deployment_secret",
  ]),
} satisfies Partial<Record<ServerEnvVar, ReadonlySet<string>>>;

const validateStripeSecretKey = (
  context: z.RefinementCtx,
  stripeSecretKey: string,
) => {
  if (!stripeSecretKey) {
    return;
  }

  if (placeholderValues.STRIPE_SECRET_KEY.has(stripeSecretKey)) {
    addIssue(
      context,
      "STRIPE_SECRET_KEY",
      "placeholder",
      "STRIPE_SECRET_KEY must not use the example placeholder value.",
    );
    return;
  }

  if (!stripeSecretKeyPattern.test(stripeSecretKey)) {
    addIssue(
      context,
      "STRIPE_SECRET_KEY",
      "malformed",
      "STRIPE_SECRET_KEY must use a Stripe secret key prefix.",
    );
  }
};

const validateStripeWebhookSecret = (
  context: z.RefinementCtx,
  stripeWebhookSecret: string,
) => {
  if (!stripeWebhookSecret) {
    return;
  }

  if (placeholderValues.STRIPE_WEBHOOK_SECRET.has(stripeWebhookSecret)) {
    addIssue(
      context,
      "STRIPE_WEBHOOK_SECRET",
      "placeholder",
      "STRIPE_WEBHOOK_SECRET must not use the example placeholder value.",
    );
    return;
  }

  if (!stripeWebhookSecretPattern.test(stripeWebhookSecret)) {
    addIssue(
      context,
      "STRIPE_WEBHOOK_SECRET",
      "malformed",
      "STRIPE_WEBHOOK_SECRET must use a Stripe webhook secret prefix.",
    );
  }
};

const supportedLogLevelSet = new Set<string>(supportedLogLevels);

const validateLogLevel = (
  context: z.RefinementCtx,
  logLevel: string,
) => {
  if (!supportedLogLevelSet.has(logLevel)) {
    addIssue(
      context,
      "LOG_LEVEL",
      "unsupported",
      "LOG_LEVEL must be a supported logger level.",
    );
  }
};

const toServerEnvValidationIssue = (
  issue: z.core.$ZodIssue,
): ServerEnvValidationIssue => {
  const envVar =
    serverEnvVars.find((candidate) => candidate === issue.path[0]) ??
    "REDIS_URL";
  const params = "params" in issue ? issue.params : undefined;
  const category =
    params &&
    typeof params === "object" &&
    "category" in params &&
    isServerEnvIssueCategory(params.category)
      ? params.category
      : "malformed";

  return {
    envVar,
    category,
    message: issue.message,
  };
};

const isServerEnvIssueCategory = (
  category: unknown,
): category is ServerEnvIssueCategory =>
  category === "missing" ||
  category === "malformed" ||
  category === "placeholder" ||
  category === "unsupported";

const formatServerEnvErrorMessage = (
  issues: ReadonlyArray<ServerEnvValidationIssue>,
) => {
  const issueSummaries = issues
    .map((issue) => `${issue.envVar} (${issue.category})`)
    .join(", ");

  return `Invalid server environment: ${issueSummaries}`;
};
