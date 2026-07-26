import type { SupportedLogLevel } from "../lib/logger.server";

export const serverEnvVars: readonly [
  "REDIS_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "LOG_LEVEL",
];

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

export type ServerEnvInputParseResult =
  | Readonly<{
      ok: true;
      value: ServerEnv;
    }>
  | Readonly<{
      ok: false;
      issues: ReadonlyArray<ServerEnvValidationIssue>;
    }>;

export function parseServerEnvInput(
  env: NodeJS.ProcessEnv,
): ServerEnvInputParseResult;

export function formatServerEnvErrorMessage(
  issues: ReadonlyArray<ServerEnvValidationIssue>,
): string;
