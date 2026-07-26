import { err, ok, type Result } from "neverthrow";

import {
  formatServerEnvErrorMessage,
  parseServerEnvInput,
  serverEnvVars,
  type ServerEnv,
  type ServerEnvIssueCategory,
  type ServerEnvValidationIssue,
  type ServerEnvVar,
} from "./server-env-validation.mjs";

export {
  formatServerEnvErrorMessage,
  serverEnvVars,
  type ServerEnv,
  type ServerEnvIssueCategory,
  type ServerEnvValidationIssue,
  type ServerEnvVar,
};

export class ServerEnvValidationError extends Error {
  readonly code = "invalid_server_env";
  readonly issues: ReadonlyArray<ServerEnvValidationIssue>;

  constructor(issues: ReadonlyArray<ServerEnvValidationIssue>) {
    super(formatServerEnvErrorMessage(issues));
    this.name = "ServerEnvValidationError";
    this.issues = issues;
  }
}

export type ServerEnvParseResult = Result<ServerEnv, ServerEnvValidationError>;

export const parseServerEnv = (
  env: NodeJS.ProcessEnv = process.env,
): ServerEnvParseResult => {
  const parseResult = parseServerEnvInput(env);

  if (!parseResult.ok) {
    return err(new ServerEnvValidationError(parseResult.issues));
  }

  return ok(parseResult.value);
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
