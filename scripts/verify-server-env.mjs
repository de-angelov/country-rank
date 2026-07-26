#!/usr/bin/env node
/* global process */

import { fileURLToPath } from "node:url";
import {
  formatServerEnvErrorMessage,
  parseServerEnvInput,
} from "../app/config/server-env-validation.mjs";

export const verifyServerEnv = (env = process.env) => {
  const result = parseServerEnvInput(env);

  if (result.ok) {
    return {
      ok: true,
    };
  }

  return {
    ok: false,
    message: formatServerEnvErrorMessage(result.issues),
    issues: result.issues,
  };
};

export const runStartupEnvVerifier = ({
  env = process.env,
  stderr = process.stderr,
} = {}) => {
  const result = verifyServerEnv(env);

  if (result.ok) {
    return 0;
  }

  stderr.write(`${result.message}\n`);

  for (const issue of result.issues) {
    stderr.write(`- ${issue.envVar}: ${issue.message}\n`);
  }

  return 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runStartupEnvVerifier();
}
