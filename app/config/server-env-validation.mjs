/* global URL */

import { defaultLogLevel, supportedLogLevels } from "../lib/logger-constants.mjs";

export const serverEnvVars = [
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LOG_LEVEL",
];

export const parseServerEnvInput = (env) => {
  const issues = [];

  validateRequiredValue(
    issues,
    "REDIS_URL",
    env.REDIS_URL,
    "REDIS_URL must be set.",
  );
  validateRequiredValue(
    issues,
    "STRIPE_SECRET_KEY",
    env.STRIPE_SECRET_KEY,
    "STRIPE_SECRET_KEY must be set.",
  );
  validateRequiredValue(
    issues,
    "STRIPE_WEBHOOK_SECRET",
    env.STRIPE_WEBHOOK_SECRET,
    "STRIPE_WEBHOOK_SECRET must be set.",
  );

  const redisUrl = trimRequired(env.REDIS_URL);
  const stripeSecretKey = trimRequired(env.STRIPE_SECRET_KEY);
  const stripeWebhookSecret = trimRequired(env.STRIPE_WEBHOOK_SECRET);
  const configuredLogLevel = env.LOG_LEVEL?.trim().toLowerCase();
  const logLevel = configuredLogLevel || defaultLogLevel;

  validateRedisUrl(issues, redisUrl);
  validateStripeSecretKey(issues, stripeSecretKey);
  validateStripeWebhookSecret(issues, stripeWebhookSecret);
  validateLogLevel(issues, logLevel);

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    value: {
      REDIS_URL: redisUrl,
      STRIPE_SECRET_KEY: stripeSecretKey,
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      LOG_LEVEL: logLevel,
    },
  };
};

export const formatServerEnvErrorMessage = (issues) => {
  const issueSummaries = issues
    .map((issue) => `${issue.envVar} (${issue.category})`)
    .join(", ");

  return `Invalid server environment: ${issueSummaries}`;
};

const addIssue = (issues, envVar, category, message) => {
  issues.push({
    envVar,
    category,
    message,
  });
};

const validateRequiredValue = (issues, envVar, value, message) => {
  if (!value?.trim()) {
    addIssue(issues, envVar, "missing", message);
  }
};

const trimRequired = (value) => value?.trim() ?? "";

const validateRedisUrl = (issues, redisUrl) => {
  if (!redisUrl) {
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    addIssue(issues, "REDIS_URL", "malformed", "REDIS_URL must be a Redis URL.");
    return;
  }

  if (parsedUrl.protocol !== "redis:" && parsedUrl.protocol !== "rediss:") {
    addIssue(issues, "REDIS_URL", "malformed", "REDIS_URL must be a Redis URL.");
  }
};

const stripeSecretKeyPattern = /^sk_(test|live)_[A-Za-z0-9_]+$/;
const stripeWebhookSecretPattern = /^whsec_[A-Za-z0-9_]+$/;

const placeholderValues = {
  STRIPE_SECRET_KEY: new Set(["sk_test_replace_with_local_test_secret"]),
  STRIPE_WEBHOOK_SECRET: new Set([
    "whsec_replace_with_local_or_deployment_secret",
  ]),
};

const validateStripeSecretKey = (issues, stripeSecretKey) => {
  if (!stripeSecretKey) {
    return;
  }

  if (placeholderValues.STRIPE_SECRET_KEY.has(stripeSecretKey)) {
    addIssue(
      issues,
      "STRIPE_SECRET_KEY",
      "placeholder",
      "STRIPE_SECRET_KEY must not use the example placeholder value.",
    );
    return;
  }

  if (!stripeSecretKeyPattern.test(stripeSecretKey)) {
    addIssue(
      issues,
      "STRIPE_SECRET_KEY",
      "malformed",
      "STRIPE_SECRET_KEY must use a Stripe secret key prefix.",
    );
  }
};

const validateStripeWebhookSecret = (issues, stripeWebhookSecret) => {
  if (!stripeWebhookSecret) {
    return;
  }

  if (placeholderValues.STRIPE_WEBHOOK_SECRET.has(stripeWebhookSecret)) {
    addIssue(
      issues,
      "STRIPE_WEBHOOK_SECRET",
      "placeholder",
      "STRIPE_WEBHOOK_SECRET must not use the example placeholder value.",
    );
    return;
  }

  if (!stripeWebhookSecretPattern.test(stripeWebhookSecret)) {
    addIssue(
      issues,
      "STRIPE_WEBHOOK_SECRET",
      "malformed",
      "STRIPE_WEBHOOK_SECRET must use a Stripe webhook secret prefix.",
    );
  }
};

const supportedLogLevelSet = new Set(supportedLogLevels);

const validateLogLevel = (issues, logLevel) => {
  if (!supportedLogLevelSet.has(logLevel)) {
    addIssue(
      issues,
      "LOG_LEVEL",
      "unsupported",
      "LOG_LEVEL must be a supported logger level.",
    );
  }
};
